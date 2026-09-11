import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Cpu, Clock, ArrowRightLeft, CheckCircle2, AlertTriangle, Ban } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { ApiErrorDetail, BlockSlot, Defect, HorizonType, OverridePreviewResponse, ScheduledSlot } from '../../types';

interface DefectExplainModalProps {
  defect: Defect | null;
  onClose: () => void;
  horizon?: HorizonType;
  schedule?: ScheduledSlot[];
  slots?: BlockSlot[];
  canOverride?: boolean;
  /** Called after a successful confirm so the parent can re-fetch live schedule data. */
  onConfirmSuccess?: () => void;
}

const REASON_OPTIONS = [
  { value: 'prioritization_mistake', label: 'Prioritization mistake' },
  { value: 'missed_bundling_opportunity', label: 'Missed bundling opportunity' },
  { value: 'weather_or_emergency', label: 'Weather or emergency' },
  { value: 'crew_or_resource_unavailable', label: 'Crew or resource unavailable' },
  { value: 'emergency_reprioritization', label: 'Emergency reprioritization' },
  { value: 'other', label: 'Other' },
];

const toAssignedIds = (slot: ScheduledSlot): string[] => {
  const assigned = slot.assigned_defect_ids;
  if (Array.isArray(assigned)) return assigned;
  return typeof assigned === 'string' ? assigned.replace(/\[|\]|'/g, '').split(',').map(v => v.trim()).filter(Boolean) : [];
};

export const DefectExplainModal: React.FC<DefectExplainModalProps> = ({
  defect,
  onClose,
  horizon = 'weekly',
  schedule = [],
  slots = [],
  canOverride = true,
  onConfirmSuccess,
}) => {
  const [targetSlotId, setTargetSlotId] = useState('');
  const [reasonCategory, setReasonCategory] = useState(REASON_OPTIONS[0].value);
  const [reasonFreetext, setReasonFreetext] = useState('');
  const [preview, setPreview] = useState<OverridePreviewResponse | null>(null);
  // Generic error message for 409/network/unexpected errors
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Structured 403 payload — P1 policy rejection, rendered distinctly
  const [policyRejection, setPolicyRejection] = useState<ApiErrorDetail | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  // Officer must explicitly acknowledge P1 displacement before Confirm is enabled
  const [p1Acknowledged, setP1Acknowledged] = useState(false);

  useEffect(() => {
    if (!defect) return;

    const currentSlot = schedule.find((slot) => toAssignedIds(slot).includes(defect.defect_id));
    const sameSectionSlots = slots.filter((slot) => slot.section_id === defect.section_id);
    const nextTarget = currentSlot?.slot_id ?? sameSectionSlots[0]?.slot_id ?? '';

    setTargetSlotId(nextTarget);
    setPreview(null);
    setPreviewError(null);
    setPolicyRejection(null);
    setConfirmMessage(null);
    setReasonCategory(REASON_OPTIONS[0].value);
    setReasonFreetext('');
    setP1Acknowledged(false);
  }, [defect, schedule, slots]);

  if (!defect) return null;

  const isP1 = defect.urgency_band.includes('P1');
  const isP2 = defect.urgency_band.includes('P2');
  const priorityScore = defect.final_priority_score ?? defect.priority_score ?? defect.rule_priority_score ?? 75.0;
  const mlScore = defect.ml_priority_score ?? (priorityScore + 0.2);
  const currentSlot = schedule.find((slot) => toAssignedIds(slot).includes(defect.defect_id));
  const candidateSlots = slots.filter((slot) => slot.section_id === defect.section_id).sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  // ── Gap 1 fix: reason_category included in preview call ──────────────────
  const handlePreview = async () => {
    setPreview(null);
    setPreviewError(null);
    setPolicyRejection(null);
    setConfirmMessage(null);
    setP1Acknowledged(false);

    if (!targetSlotId) {
      setPreviewError('Choose a target slot before previewing the override.');
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await api.previewOverride({
        defect_id: defect.defect_id,
        target_slot_id: targetSlotId,
        horizon,
        reason_category: reasonCategory,  // ← C1 Gap 1: was missing
      });
      setPreview(response);
      if (!response.feasible) {
        setPreviewError(response.reason ?? 'Override preview is not feasible.');
      }
    } catch (err: unknown) {
      // ── Gap 2 fix: three-way error handling ──────────────────────────────
      if (err instanceof ApiError) {
        if (err.status === 403) {
          // Policy rejection — P1 deferral with non-emergency reason_category.
          // Show the structured reason (deferred IDs, why it was blocked) so the
          // officer knows exactly what to do, not just "error".
          const d = err.detail as ApiErrorDetail | null;
          setPolicyRejection(
            d ?? {
              reason: 'p1_displacement_not_authorized',
              message: err.message,
            }
          );
        } else if (err.status === 409) {
          // Physical infeasibility — slot capacity numbers are already shown in
          // the preview panel; surface a concise capacity message.
          setPreviewError(`Capacity infeasibility: ${err.message}`);
        } else {
          setPreviewError(err.message);
        }
      } else {
        setPreviewError(err instanceof Error ? err.message : 'Override preview failed.');
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !preview.feasible) return;
    setIsConfirming(true);
    setConfirmMessage(null);
    setPreviewError(null);
    setPolicyRejection(null);

    try {
      const response = await api.confirmOverride({
        defect_id: defect.defect_id,
        target_slot_id: targetSlotId,
        horizon,
        changed_by: 'Dashboard User',
        reason_category: reasonCategory,
        reason_freetext: reasonFreetext || undefined,
      });
      setConfirmMessage(response.message);
      // ── Gap 3 fix: trigger parent re-fetch from live API ─────────────────
      onConfirmSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        // Re-check: policy gate also enforced at confirm time
        const d = err.detail as ApiErrorDetail | null;
        setPolicyRejection(d ?? { reason: 'p1_displacement_not_authorized', message: err.message });
      } else {
        setPreviewError(err instanceof Error ? err.message : 'Override confirmation failed.');
      }
    } finally {
      setIsConfirming(false);
    }
  };

  // Confirm button enabled only when: preview feasible, no P1 that needs ack, or P1 acknowledged
  const confirmEnabled =
    !isConfirming &&
    !!preview &&
    preview.feasible &&
    (!preview.p1_displacement || p1Acknowledged);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl glass-card-elevated rounded-3xl p-6 sm:p-8 border border-[var(--border-medium)] shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        >
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-extrabold text-[var(--accent-amber)] px-2.5 py-1 rounded-lg bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)]">
                {defect.defect_id}
              </span>
              <div>
                <span className="text-xs font-semibold text-[var(--text-heading)] block">
                  {defect.defect_type || 'Track Maintenance Order'}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {defect.section_id} • {defect.location || 'Prayagraj Main Line'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-pill-hover)] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className={`w-4 h-4 ${isP1 ? 'text-[var(--accent-red)]' : isP2 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-steel)]'}`} />
                  <span className="text-xs font-bold text-[var(--text-heading)]">Priority band</span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">{defect.urgency_band}</div>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-[var(--accent-amber)]" />
                  <span className="text-xs font-bold text-[var(--text-heading)]">ML score</span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">{mlScore.toFixed(2)} / 100</div>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-[var(--accent-green)]" />
                  <span className="text-xs font-bold text-[var(--text-heading)]">Duration</span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">{defect.estimated_duration_hours} hrs</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[var(--accent-amber)]" />
                <span className="text-xs font-bold text-[var(--text-heading)]">Override plan</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Current slot</label>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono text-[var(--text-heading)]">
                    {currentSlot?.slot_id ?? 'Not currently scheduled'}
                  </div>
                </div>

                <div>
                  <label htmlFor="target-slot" className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Target slot</label>
                  <select
                    id="target-slot"
                    value={targetSlotId}
                    onChange={(e) => { setTargetSlotId(e.target.value); setPreview(null); setPolicyRejection(null); setPreviewError(null); setP1Acknowledged(false); }}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono text-[var(--text-heading)] focus:border-[var(--accent-amber)] focus:outline-none"
                  >
                    {candidateSlots.length === 0 && <option value="">No compatible slots available</option>}
                    {candidateSlots.map((slot) => (
                      <option key={slot.slot_id} value={slot.slot_id}>{slot.slot_id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="override-reason" className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Reason category</label>
                <select
                  id="override-reason"
                  value={reasonCategory}
                  onChange={(e) => { setReasonCategory(e.target.value); setPreview(null); setPolicyRejection(null); setPreviewError(null); setP1Acknowledged(false); }}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono text-[var(--text-heading)] focus:border-[var(--accent-amber)] focus:outline-none"
                >
                  {REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="override-note" className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Reason note</label>
                <textarea
                  id="override-note"
                  value={reasonFreetext}
                  onChange={(e) => setReasonFreetext(e.target.value)}
                  rows={2}
                  placeholder="Optional note for human review"
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono text-[var(--text-heading)] focus:border-[var(--accent-amber)] focus:outline-none"
                />
              </div>

              {/* ── Gap 2 fix: 403 — policy rejection banner ─────────────────────── */}
              {policyRejection && (
                <div className="rounded-xl border border-[var(--accent-red-border)] bg-[var(--accent-red-bg)] px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-[var(--accent-red)] shrink-0" />
                    <span className="text-xs font-bold text-[var(--accent-red)]">Policy rejection — P1 deferral not authorised</span>
                  </div>
                  <p className="text-[11px] text-[var(--accent-red)] leading-relaxed">{policyRejection.message}</p>
                  {policyRejection.newly_deferred && policyRejection.newly_deferred.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase text-[var(--accent-red)] opacity-70 mb-1">P1 defects that would be deferred</div>
                      <div className="flex flex-wrap gap-1">
                        {policyRejection.newly_deferred.map((id) => (
                          <span key={id} className="rounded-full bg-[var(--accent-red-bg)] border border-[var(--accent-red-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--accent-red)]">{id}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] font-mono text-[var(--accent-red)] opacity-80">
                    Switch reason category to <strong>Weather or emergency</strong> or <strong>Emergency reprioritization</strong> to proceed.
                  </p>
                </div>
              )}

              {/* ── Gap 2 fix: 409 / other error ─────────────────────────────────── */}
              {previewError && (
                <div className="rounded-xl border border-[var(--accent-red-border)] bg-[var(--accent-red-bg)] px-3 py-2 text-xs text-[var(--accent-red)]">
                  {previewError}
                </div>
              )}

              {confirmMessage && (
                <div className="rounded-xl border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)] px-3 py-2 text-xs text-[var(--accent-green)] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {confirmMessage}
                </div>
              )}

              {canOverride ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    id="btn-preview-override"
                    onClick={handlePreview}
                    disabled={isPreviewing || !targetSlotId}
                    className="px-4 py-2 rounded-full bg-[var(--accent-amber)] text-[var(--text-inverse)] text-xs font-mono font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {isPreviewing ? 'Previewing…' : 'Preview override'}
                  </button>

                  <button
                    id="btn-confirm-override"
                    onClick={handleConfirm}
                    disabled={!confirmEnabled}
                    className="px-4 py-2 rounded-full bg-[var(--accent-green)] text-white text-xs font-mono font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {isConfirming ? 'Confirming…' : 'Confirm override'}
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center px-3 py-2 rounded-full bg-[var(--bg-pill)] border border-[var(--border-subtle)] text-[10px] font-mono font-bold text-[var(--text-muted)]">
                  Read-only role — override controls unavailable
                </div>
              )}
            </div>

            {preview && (
              <div className="p-4 rounded-2xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-heading)]">Preview summary</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${preview.feasible ? 'bg-[var(--accent-green-bg)] text-[var(--accent-green)] border-[var(--accent-green-border)]' : 'bg-[var(--accent-red-bg)] text-[var(--accent-red)] border-[var(--accent-red-border)]'}`}>
                    {preview.feasible ? 'Feasible' : 'Blocked'}
                  </span>
                </div>

                {/* ── Gap 2 fix: P1 displacement warning banner (200 + p1_displacement=true) */}
                {preview.feasible && preview.p1_displacement && (
                  <div className="rounded-xl border border-[var(--accent-red-border)] bg-[var(--accent-red-bg)] px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--accent-red)] shrink-0" />
                      <span className="text-xs font-bold text-[var(--accent-red)]">⚠ P1 safety defect will be deferred</span>
                    </div>
                    <p className="text-[11px] text-[var(--accent-red)] leading-relaxed">
                      This override displaces a P1 — Immediate Safety defect from the schedule.
                      Emergency reason <strong>{reasonCategory}</strong> has been accepted.
                      Confirm only if you have operational authority and this is a genuine emergency.
                    </p>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {preview.newly_deferred.map((id) => (
                        <span key={id} className="rounded-full bg-[var(--accent-red-bg)] border border-[var(--accent-red-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--accent-red)]">{id}</span>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        id="chk-p1-acknowledge"
                        type="checkbox"
                        checked={p1Acknowledged}
                        onChange={(e) => setP1Acknowledged(e.target.checked)}
                        className="accent-[var(--accent-red)] w-3.5 h-3.5"
                      />
                      <span className="text-[11px] font-mono text-[var(--accent-red)]">
                        I understand this defers a P1 safety defect and take responsibility for this decision.
                      </span>
                    </label>
                  </div>
                )}

                {/* P2-only displacement — amber advisory, no acknowledgement required */}
                {preview.feasible && !preview.p1_displacement && preview.priority_alert && (
                  <div className="rounded-xl border border-[var(--accent-amber-border)] bg-[var(--accent-amber-bg)] px-4 py-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-[var(--accent-amber)]">P2 priority alert</p>
                      <p className="text-[11px] text-[var(--accent-amber)] opacity-80">
                        This override defers P2 — Urgent defect(s). Review the deferred list before confirming.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Available hrs</div>
                    <div className="font-mono font-bold text-[var(--text-heading)]">{preview.available_hours}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Required hrs</div>
                    <div className="font-mono font-bold text-[var(--text-heading)]">{preview.required_hours}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Deferred</div>
                    <div className="font-mono font-bold text-[var(--text-heading)]">{preview.newly_deferred.length}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">P1 impact</div>
                    <div className={`font-mono font-bold ${preview.p1_displacement ? 'text-[var(--accent-red)]' : 'text-[var(--text-heading)]'}`}>
                      {preview.p1_displacement ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>

                {preview.newly_deferred.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Newly deferred</div>
                    <div className="flex flex-wrap gap-1">
                      {preview.newly_deferred.map((item) => (
                        <span key={item} className="rounded-full bg-[var(--accent-amber-bg)] border border-[var(--accent-amber-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--accent-amber)]">{item}</span>
                      ))}
                    </div>
                  </div>
                )}

                {preview.newly_cleared.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Newly cleared</div>
                    <div className="flex flex-wrap gap-1">
                      {preview.newly_cleared.map((item) => (
                        <span key={item} className="rounded-full bg-[var(--accent-green-bg)] border border-[var(--accent-green-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--accent-green)]">{item}</span>
                      ))}
                    </div>
                  </div>
                )}

                {preview.metrics_after && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Before vs after clearance</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                        <div className="font-mono font-bold text-[var(--text-heading)]">Before</div>
                        <div className="font-mono text-[var(--text-muted)]">{JSON.stringify(preview.metrics_before)}</div>
                      </div>
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                        <div className="font-mono font-bold text-[var(--text-heading)]">After</div>
                        <div className="font-mono text-[var(--text-muted)]">{JSON.stringify(preview.metrics_after)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-pill-hover)] border border-[var(--border-subtle)] text-xs font-mono font-bold text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
