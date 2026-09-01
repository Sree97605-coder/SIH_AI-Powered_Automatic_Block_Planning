"""Unit tests for Quantum-Inspired QUBO / Simulated Annealing Optimizer."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
DATA_DIR = PROJECT_ROOT / "data"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

from quantum_optimization import QuantumBlockOptimizer, optimize_quantum


class QuantumOptimizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.q_opt = QuantumBlockOptimizer(data_dir=DATA_DIR)

    def test_qubo_matrix_construction(self) -> None:
        """Test that QUBO matrix Q is constructed with correct dimensions and symmetry."""
        from load_defects import load_defects
        from load_slots import load_block_slots
        from ml_prioritization import run_prioritization

        defects_df, _ = run_prioritization(DATA_DIR)
        slots_df = load_block_slots(DATA_DIR)
        weekly_slots = slots_df[slots_df["start_datetime"] <= "2026-09-13T23:59:59"].reset_index(drop=True)

        Q = self.q_opt.build_qubo_formulation(defects_df, weekly_slots)

        N = len(self.q_opt.variables)
        self.assertGreater(N, 100)
        self.assertEqual(Q.shape, (N, N))
        # Verify symmetry
        self.assertTrue(np.allclose(Q, Q.T))
        # Diagonal terms should be negative (rewards)
        self.assertTrue((np.diag(Q) < 0).any())

    def test_simulated_annealing_solve(self) -> None:
        """Test simulated annealing execution and energy descent."""
        from load_defects import load_defects
        from load_slots import load_block_slots
        from ml_prioritization import run_prioritization

        defects_df, _ = run_prioritization(DATA_DIR)
        slots_df = load_block_slots(DATA_DIR)
        weekly_slots = slots_df[slots_df["start_datetime"] <= "2026-09-13T23:59:59"].reset_index(drop=True)

        self.q_opt.build_qubo_formulation(defects_df, weekly_slots)
        x_sol, energy = self.q_opt.solve_simulated_annealing(num_reads=2, num_sweeps=500)

        self.assertEqual(len(x_sol), len(self.q_opt.variables))
        self.assertLess(energy, 0.0)  # Energy should be negative (net reward)

    def test_end_to_end_quantum_run(self) -> None:
        """Test full quantum optimization pipeline and artifact export."""
        summary = self.q_opt.run_quantum_optimization(horizon="weekly")

        self.assertEqual(summary["method"], "Quantum-Inspired Simulated Annealing (QUBO)")
        self.assertGreater(summary["total_defects_scheduled"], 10)
        self.assertGreater(summary["total_priority_cleared"], 500.0)
        self.assertTrue(Path(summary["quantum_schedule_csv"]).exists())


if __name__ == "__main__":
    unittest.main()
