import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Cpu, Layers, Check } from 'lucide-react';

export const HowItDecidesSection: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Hard Safety Rules First',
      badge: 'Deterministic Safety',
      badgeColor: 'text-[#2E8B57] bg-[#2E8B57]/15 border-[#2E8B57]/30',
      icon: ShieldCheck,
      iconColor: 'text-[#2E8B57]',
      desc: 'All defect orders are first classified into strict safety urgency bands (P1 Immediate to P4 Routine). Hard safety rules can never be downgraded or overridden by the AI.',
      points: ['P1 rail fractures must be scheduled in next available block', 'Zero safety compromise policy', 'Physical track & machine duration limits strictly enforced'],
    },
    {
      num: '02',
      title: 'ML Fine-Grained Risk Ranking',
      badge: 'RandomForest Regressor',
      badgeColor: 'text-[#F4C766] bg-[#E8A33D]/15 border-[#E8A33D]/30',
      icon: Cpu,
      iconColor: 'text-[#F4C766]',
      desc: 'Within each safety band, a trained machine learning model evaluates asset degradation, traffic density, and overdue aging to prioritize the most critical work items.',
      points: ['Ranks items within the same urgency band', 'Learns from historical track maintenance data', 'Transparent feature-importance scores for every defect'],
    },
    {
      num: '03',
      title: 'Multi-Department Bundling Solver',
      badge: 'Integer Linear Programming',
      badgeColor: 'text-[#5C8FA8] bg-[#3E6C8A]/15 border-[#3E6C8A]/30',
      icon: Layers,
      iconColor: 'text-[#5C8FA8]',
      desc: 'The mathematical solver schedules co-located maintenance simultaneously — letting Track, Signals (S&T), and Overhead Electrical (TRD) teams share the same power shadow block.',
      points: ['Avoids shutting down track multiple times for same section', 'Boosts corridor operational throughput by +23.3%', 'Eliminates departmental scheduling silos'],
    },
  ];

  return (
    <section id="how-it-decides" className="py-28 sm:py-36 px-4 sm:px-8 max-w-7xl mx-auto relative">
      
      {/* Section Header */}
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3E6C8A]/15 border border-[#3E6C8A]/30 text-xs font-mono text-[#5C8FA8] mb-3">
          <Cpu className="w-3.5 h-3.5" />
          <span>ALGORITHMIC TRANSPARENCY</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-[#F4F6F8] tracking-tight max-w-2xl">
          How the Hybrid Optimizer Decides
        </h2>
        <p className="text-sm text-[#9BAAB5] mt-2 max-w-xl">
          A safety-first architecture combining deterministic Indian Railways engineering codes with machine learning optimization.
        </p>
      </div>

      {/* 3 Step Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: idx * 0.12 }}
              className="glass-card-elevated rounded-3xl p-8 border border-white/12 shadow-glass flex flex-col justify-between relative group hover:border-[#E8A33D]/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-3xl font-black text-white/20 group-hover:text-[#E8A33D]/40 transition-colors">
                    {step.num}
                  </span>
                  <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${step.badgeColor}`}>
                    {step.badge}
                  </span>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-5">
                  <Icon className={`w-6 h-6 ${step.iconColor}`} />
                </div>

                <h3 className="font-display font-bold text-lg text-[#F4F6F8] mb-2">
                  {step.title}
                </h3>

                <p className="text-xs sm:text-sm text-[#9BAAB5] leading-relaxed mb-6">
                  {step.desc}
                </p>
              </div>

              <div className="pt-4 border-t border-white/8 space-y-2">
                {step.points.map((pt, pIdx) => (
                  <div key={pIdx} className="flex items-start gap-2 text-xs text-[#F4F6F8]">
                    <Check className="w-3.5 h-3.5 text-[#2E8B57] shrink-0 mt-0.5" />
                    <span className="text-[#9BAAB5]">{pt}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

    </section>
  );
};
