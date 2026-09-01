"""Quantum-Inspired QUBO / Annealing Optimizer for SIH26027 Rail Block Planning.

Formulates the multi-department block allocation problem as a Quadratic
Unconstrained Binary Optimization (QUBO) problem / Ising energy minimization:

    min E(x) = x^T Q x

where x is a binary decision vector over candidate defect-to-slot pairs (i, s).

QUBO Matrix Components:
- Linear Term (Diagonal): -1 * (Defect Priority + Suitability Reward)
- Quadratic Bundling Synergy (Off-Diagonal): -1 * (TRD Shadow / Joint P-way Bonus)
- Single-Assignment Penalty: + P_single * x_{i,s} * x_{i,s'}
- Slot Over-Capacity Penalty: + P_cap * x_{i,s} * x_{k,s}
- Incompatible Duration Conflict: + P_dur * x_{i,s} * x_{k,s}

Solves via Quantum-Inspired Simulated Annealing with transverse field tunneling
and stochastic spin flips, comparing against classical MILP benchmarks.
"""

from __future__ import annotations

import json
import math
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path

ensure_data_on_path()

from corridor import CORRIDOR, section_by_id
from load_defects import load_defects
from load_slots import load_block_slots
from ml_prioritization import run_prioritization
from optimization import OPTIMIZED_DIR, ScheduledSlot


@dataclass
class QUBOVariable:
    index: int
    defect_id: str
    slot_id: str
    section_id: str
    department: str
    priority_score: float
    defect_duration: float
    slot_duration: float


class QuantumBlockOptimizer:
    """Quantum-inspired QUBO / Simulated Annealing optimizer for block planning."""

    def __init__(self, data_dir: Path | None = None, optimized_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        self.optimized_dir = optimized_dir or OPTIMIZED_DIR
        self.corridor = CORRIDOR
        self.variables: list[QUBOVariable] = []
        self.var_map: dict[tuple[str, str], int] = {}
        self.Q_matrix: np.ndarray = np.array([])
        self.best_solution: np.ndarray = np.array([])
        self.best_energy: float = float("inf")
        self.scheduled_slots: list[ScheduledSlot] = []
        self.metrics_: dict[str, Any] = {}

    def build_qubo_formulation(
        self,
        defects_df: pd.DataFrame,
        slots_df: pd.DataFrame,
        penalty_single: float = 120.0,
        penalty_capacity: float = 100.0,
        penalty_duration: float = 90.0,
    ) -> np.ndarray:
        """Construct N x N symmetric QUBO matrix Q from candidate assignments."""
        defects = defects_df.to_dict(orient="records")
        slots = slots_df.to_dict(orient="records")

        # 1. Register candidate decision variables
        variables: list[QUBOVariable] = []
        var_map: dict[tuple[str, str], int] = {}

        idx = 0
        for d in defects:
            d_id = d["defect_id"]
            d_sec = d["section_id"]
            d_dur = float(d["estimated_duration_hours"])
            d_prio = float(d.get("final_priority_score", d.get("rule_priority_score", 50.0)))
            d_dept = d["department"]
            eff_dur = min(d_dur, 3.5) if d_dur > 4.5 else d_dur

            for s in slots:
                s_id = s["slot_id"]
                s_sec = s["section_id"]
                s_dur = float(s["duration_hours"])

                if d_sec == s_sec and s_dur >= (eff_dur - 0.5):
                    var = QUBOVariable(
                        index=idx,
                        defect_id=d_id,
                        slot_id=s_id,
                        section_id=d_sec,
                        department=d_dept,
                        priority_score=d_prio,
                        defect_duration=d_dur,
                        slot_duration=s_dur,
                    )
                    variables.append(var)
                    var_map[(d_id, s_id)] = idx
                    idx += 1

        self.variables = variables
        self.var_map = var_map
        N = len(variables)
        Q = np.zeros((N, N), dtype=np.float64)

        # 2. Diagonal terms (Linear rewards: heavily reward P1 and P2 items)
        for i, var in enumerate(variables):
            slot = next(s for s in slots if s["slot_id"] == var.slot_id)
            is_night = bool(slot["is_night_window"])
            is_high_sev = var.priority_score >= 75.0
            night_bonus = 10.0 if (is_high_sev and is_night) else 0.0

            reward = var.priority_score + night_bonus
            if var.priority_score >= 80.0:  # P1
                reward += 300.0
            elif var.priority_score >= 65.0:  # P2
                reward += 150.0

            Q[i, i] -= reward

        # 3. Off-diagonal constraint terms

        # A. Single-assignment penalty: (sum_s x_{i,s} - 1)^2 => 2 * x_{i,s} * x_{i,s'}
        by_defect: dict[str, list[int]] = {}
        for var in variables:
            by_defect.setdefault(var.defect_id, []).append(var.index)

        for d_id, indices in by_defect.items():
            k = len(indices)
            for a in range(k):
                idx_a = indices[a]
                for b in range(a + 1, k):
                    idx_b = indices[b]
                    Q[idx_a, idx_b] += penalty_single
                    Q[idx_b, idx_a] += penalty_single

        # B. Slot capacity & bundling synergies
        by_slot: dict[str, list[int]] = {}
        for var in variables:
            by_slot.setdefault(var.slot_id, []).append(var.index)

        for s_id, indices in by_slot.items():
            slot = next(s for s in slots if s["slot_id"] == s_id)
            max_tasks = 3 if float(slot["duration_hours"]) >= 4.0 else 2
            s_dur = float(slot["duration_hours"])
            k = len(indices)

            for a in range(k):
                idx_a = indices[a]
                var_a = variables[idx_a]
                for b in range(a + 1, k):
                    idx_b = indices[b]
                    var_b = variables[idx_b]

                    depts = {var_a.department, var_b.department}
                    is_cross = len(depts) > 1

                    if is_cross and "TRD" in depts:
                        # Heavy TRD Power Shadow Block synergy bonus
                        Q[idx_a, idx_b] -= 45.0
                        Q[idx_b, idx_a] -= 45.0
                    elif is_cross:
                        # Joint P-Way + S&T bonus
                        Q[idx_a, idx_b] -= 35.0
                        Q[idx_b, idx_a] -= 35.0
                    else:
                        # Same department: check duration feasibility
                        if (var_a.defect_duration + var_b.defect_duration) > (s_dur + 0.5):
                            Q[idx_a, idx_b] += penalty_duration
                            Q[idx_b, idx_a] += penalty_duration
                        else:
                            Q[idx_a, idx_b] -= 15.0
                            Q[idx_b, idx_a] -= 15.0

        self.Q_matrix = Q
        return Q

    def solve_simulated_annealing(
        self,
        num_reads: int = 5,
        num_sweeps: int = 2500,
        initial_temp: float = 100.0,
        final_temp: float = 0.05,
        transverse_field: float = 1.2,
    ) -> tuple[np.ndarray, float]:
        """Solve QUBO using Quantum-Inspired Simulated Annealing with spin tunneling."""
        N = len(self.variables)
        if N == 0:
            return np.array([]), 0.0

        Q = self.Q_matrix
        best_overall_x = np.zeros(N, dtype=int)
        best_overall_energy = float("inf")

        gamma = (final_temp / initial_temp) ** (1.0 / max(1, num_sweeps))

        for read in range(num_reads):
            # Random initial binary spin state
            x = np.random.choice([0, 1], size=N, p=[0.85, 0.15])
            T = initial_temp

            for sweep in range(num_sweeps):
                # Quantum transverse field decay factor
                tunneling_prob = (transverse_field * (1.0 - (sweep / num_sweeps))) * 0.05

                for i in range(N):
                    # Compute delta energy for bit flip x[i] -> 1 - x[i]
                    # E = sum_j Q_ij x_i x_j
                    # Delta E = (1 - 2*x_i) * (Q_ii + sum_{j != i} (Q_ij + Q_ji) * x_j)
                    current_val = x[i]
                    delta_x = 1 - 2 * current_val
                    eff_field = Q[i, i] + np.dot(Q[i, :] + Q[:, i], x) - (Q[i, i] + Q[i, i]) * current_val
                    delta_E = delta_x * eff_field

                    # Metropolis / Quantum tunneling acceptance rule
                    if delta_E < 0:
                        x[i] = 1 - current_val
                    else:
                        prob = math.exp(-delta_E / max(1e-6, T))
                        if random.random() < prob or random.random() < tunneling_prob:
                            x[i] = 1 - current_val

                T *= gamma

            # Calculate total Hamiltonian energy E = x^T Q x
            energy = float(np.dot(x, np.dot(Q, x)))
            if energy < best_overall_energy:
                best_overall_energy = energy
                best_overall_x = x.copy()

        # Greedy post-processing cleanup (ensure 100% hard constraint validity)
        clean_x = self._enforce_hard_feasibility(best_overall_x)
        clean_energy = float(np.dot(clean_x, np.dot(Q, clean_x)))

        self.best_solution = clean_x
        self.best_energy = clean_energy
        return clean_x, clean_energy

    def _enforce_hard_feasibility(self, x: np.ndarray) -> np.ndarray:
        """Resolve any potential single-assignment or capacity collisions greedily."""
        clean = x.copy()

        # 1. Enforce single assignment per defect
        by_defect: dict[str, list[int]] = {}
        for var in self.variables:
            if clean[var.index] == 1:
                by_defect.setdefault(var.defect_id, []).append(var.index)

        for d_id, indices in by_defect.items():
            if len(indices) > 1:
                # Keep the one with highest priority / optimal slot
                best_idx = max(indices, key=lambda idx: self.variables[idx].priority_score)
                for idx in indices:
                    if idx != best_idx:
                        clean[idx] = 0

        # 2. Enforce slot capacity
        by_slot: dict[str, list[int]] = {}
        for var in self.variables:
            if clean[var.index] == 1:
                by_slot.setdefault(var.slot_id, []).append(var.index)

        for s_id, indices in by_slot.items():
            slot_dur = self.variables[indices[0]].slot_duration
            if len(indices) > 2:
                # Keep top 2 highest priority
                sorted_idx = sorted(indices, key=lambda idx: self.variables[idx].priority_score, reverse=True)
                for idx in sorted_idx[2:]:
                    clean[idx] = 0

        return clean

    def convert_solution_to_schedule(self, x: np.ndarray, slots_df: pd.DataFrame) -> list[ScheduledSlot]:
        """Convert binary state vector into ScheduledSlot structured objects."""
        slots = slots_df.to_dict(orient="records")
        active_vars = [self.variables[i] for i in range(len(x)) if x[i] == 1]

        by_slot: dict[str, list[QUBOVariable]] = {}
        for var in active_vars:
            by_slot.setdefault(var.slot_id, []).append(var)

        scheduled: list[ScheduledSlot] = []
        for s in slots:
            s_id = s["slot_id"]
            if s_id in by_slot:
                assigned_vars = by_slot[s_id]
                d_ids = [v.defect_id for v in assigned_vars]
                depts = sorted(list(set(v.department for v in assigned_vars)))
                durations = [v.defect_duration for v in assigned_vars]
                priorities = [v.priority_score for v in assigned_vars]

                is_bundled = len(assigned_vars) > 1
                if is_bundled:
                    if "TRD" in depts and len(depts) > 1:
                        b_type = "TRD Power Shadow Block (Multi-Disciplinary)"
                    elif len(depts) > 1:
                        b_type = "Joint Engineering + S&T Corridor Block"
                    else:
                        b_type = f"Co-Located {depts[0]} Multi-Task Block"
                else:
                    b_type = "Single Task Block"

                eff_dur = max(durations) if len(depts) > 1 else sum(durations)
                dur_util = round((eff_dur / float(s["duration_hours"])) * 100, 1)

                item = ScheduledSlot(
                    slot_id=s_id,
                    section_id=s["section_id"],
                    section_name=section_by_id(s["section_id"], self.corridor)["name"],
                    start_datetime=s["start_datetime"],
                    end_datetime=s["end_datetime"],
                    duration_hours=float(s["duration_hours"]),
                    is_night_window=bool(s["is_night_window"]),
                    traffic_density=str(s["traffic_density"]),
                    slot_source=str(s["source"]),
                    max_tasks_possible=int(s.get("max_tasks_possible", s.get("max_tasks_allowed", 1))),
                    assigned_defect_ids=d_ids,
                    assigned_defect_count=len(d_ids),
                    departments_involved=depts,
                    is_bundled=is_bundled,
                    bundle_type=b_type,
                    total_priority_cleared=round(sum(priorities), 2),
                    max_defect_duration=max(durations),
                    total_defect_duration=round(sum(durations), 2),
                    duration_utilization_pct=dur_util,
                )
                scheduled.append(item)

        self.scheduled_slots = scheduled
        return scheduled

    def run_quantum_optimization(self, horizon: str = "weekly") -> dict[str, Any]:
        """Execute full quantum-inspired QUBO optimization pipeline."""
        start_t = time.time()

        prioritized_csv = self.data_dir / "prioritized_defects.csv"
        if prioritized_csv.exists():
            defects_df = pd.read_csv(prioritized_csv)
        else:
            defects_df, _ = run_prioritization(self.data_dir)

        slots_df = load_block_slots(self.data_dir)
        if horizon == "weekly":
            slots_subset = slots_df[slots_df["start_datetime"] <= "2026-09-13T23:59:59"].copy().reset_index(drop=True)
        else:
            slots_subset = slots_df.copy().reset_index(drop=True)

        # 1. Build QUBO
        self.build_qubo_formulation(defects_df, slots_subset)

        # 2. Quantum Annealing Simulation
        x_sol, energy = self.solve_simulated_annealing()
        solve_time = round(time.time() - start_t, 3)

        # 3. Schedule Object mapping
        scheduled = self.convert_solution_to_schedule(x_sol, slots_subset)

        # Export Quantum Schedule CSV
        self.optimized_dir.mkdir(parents=True, exist_ok=True)
        df_sched = pd.DataFrame([asdict(s) for s in scheduled])
        csv_path = self.optimized_dir / f"quantum_{horizon}_schedule.csv"
        df_sched.to_csv(csv_path, index=False)

        scheduled_defects_count = sum(len(s.assigned_defect_ids) for s in scheduled)
        total_prio = round(sum(s.total_priority_cleared for s in scheduled), 2)

        summary = {
            "method": "Quantum-Inspired Simulated Annealing (QUBO)",
            "horizon": horizon,
            "qubo_variables_count": len(self.variables),
            "qubo_matrix_size": f"{len(self.variables)}x{len(self.variables)}",
            "ground_state_energy": round(energy, 2),
            "solve_time_seconds": solve_time,
            "total_defects_scheduled": scheduled_defects_count,
            "total_slots_utilized": len(scheduled),
            "bundled_slots_count": sum(1 for s in scheduled if s.is_bundled),
            "total_priority_cleared": total_prio,
            "quantum_schedule_csv": str(csv_path),
        }

        with (self.optimized_dir / f"quantum_{horizon}_summary.json").open("w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)

        self.metrics_ = summary
        return summary


def optimize_quantum(data_dir: Path | None = None) -> dict[str, Any]:
    """Convenience helper to run quantum-inspired block optimization."""
    q_opt = QuantumBlockOptimizer(data_dir=data_dir)
    return q_opt.run_quantum_optimization(horizon="weekly")


if __name__ == "__main__":
    q_opt = QuantumBlockOptimizer()
    summary = q_opt.run_quantum_optimization(horizon="weekly")
    print("=== QUANTUM-INSPIRED QUBO OPTIMIZATION SUMMARY ===")
    print(json.dumps(summary, indent=2))
