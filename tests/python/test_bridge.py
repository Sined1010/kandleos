"""Tests for the KandleOS bridge's hooks into TradingAgents.

Needs the Python environment KandleOS sets up (TradingAgents installed); run with that interpreter:
  <userData>/agents/venv/Scripts/python.exe -I -B tests/python/test_bridge.py   (-B: no __pycache__ in resources/agents)
"""
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "resources", "agents"))
import kandleos_agents as bridge  # noqa: E402


class InstallChronos(unittest.TestCase):
    def test_only_the_market_analyst_sees_the_block_after_its_context(self):
        import tradingagents.graph.setup as setup

        seen = {}

        def fake_factory(llm):
            def node(state):
                seen["context"] = state["instrument_context"]
                return {"market_report": "report"}
            return node

        with mock.patch.object(setup, "create_market_analyst", fake_factory):
            bridge.install_chronos("CHRONOS BLOCK")
            node = setup.create_market_analyst(object())
            out = node({"instrument_context": "BASE", "company_of_interest": "AAPL", "asset_type": "stock"})
        self.assertEqual(seen["context"], "BASE\n\nCHRONOS BLOCK")
        self.assertEqual(out, {"market_report": "report"})

    def test_fails_loudly_when_tradingagents_has_no_hook(self):
        with self.assertRaises(RuntimeError):
            bridge.install_chronos("CHRONOS BLOCK", setup_module=types.SimpleNamespace())


class CaptureStructured(unittest.TestCase):
    def setUp(self):
        import tradingagents.agents.managers.portfolio_manager as pm
        import tradingagents.agents.trader.trader as trader

        self.saved = [(pm, "render_pm_decision", pm.render_pm_decision), (trader, "render_trader_proposal", trader.render_trader_proposal)]

    def tearDown(self):
        for module, name, original in self.saved:
            setattr(module, name, original)

    def test_numbers_are_taken_before_rendering_and_the_text_stays_the_same(self):
        import tradingagents.agents.managers.portfolio_manager as pm
        import tradingagents.agents.trader.trader as trader
        from tradingagents.agents.schemas import PortfolioDecision, TraderProposal

        decision = PortfolioDecision(
            rating="Overweight", executive_summary="s", investment_thesis="t", price_target=123.4, time_horizon="3-6 months"
        )
        proposal = TraderProposal(action="Buy", reasoning="r", entry_price=100.5, stop_loss=90.0, position_sizing="2 %")
        expected = (pm.render_pm_decision(decision), trader.render_trader_proposal(proposal))
        captured = bridge.capture_structured()
        self.assertEqual((pm.render_pm_decision(decision), trader.render_trader_proposal(proposal)), expected)
        self.assertEqual(captured["decision"], {"rating": "Overweight", "price_target": 123.4, "time_horizon": "3-6 months"})
        self.assertEqual(captured["trader"], {"action": "Buy", "entry_price": 100.5, "stop_loss": 90.0})


if __name__ == "__main__":
    unittest.main()
