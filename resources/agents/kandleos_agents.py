"""KandleOS bridge to TradingAgents (https://github.com/TauricResearch/TradingAgents, Apache-2.0).

Reads one JSON request on stdin and writes JSON lines on stdout:
  {"event": "step", "node": "...", "calls": n, "tokensIn": n, "tokensOut": n}   an agent called its model
  {"event": "tool", "node": "...", "name": "..."}                              an agent used a data tool
  {"event": "done", "rating": "...", "reports": {...}, "stats": {...}}         the finished analysis
  {"event": "error", "message": "..."}                                         the run failed
API keys come from the environment (set by KandleOS from its encrypted key store), never from the request.
Library logging goes to stderr, which KandleOS keeps for error messages.
"""
import json
import sys
import threading
import traceback
from typing import Any

_lock = threading.Lock()


def emit(event: dict) -> None:
    # The analysts run in parallel threads; one line per event, never interleaved.
    with _lock:
        sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main() -> int:
    # Imported here, so a broken installation still reports as a JSON error line.
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.messages import AIMessage
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    class Progress(BaseCallbackHandler):
        """Reports which agent is at work, from the LangGraph metadata of each model and tool call."""

        def __init__(self) -> None:
            super().__init__()
            self.calls = 0
            self.tokens_in = 0
            self.tokens_out = 0

        @staticmethod
        def node(metadata: dict | None) -> str:
            # Analysts run in subgraphs ("Market Analyst:<id>|agent:<id>"): the outer node names the agent.
            meta = metadata or {}
            namespace = str(meta.get("langgraph_checkpoint_ns") or "")
            return namespace.split(":", 1)[0] if namespace else str(meta.get("langgraph_node") or "")

        def _step(self, metadata: dict | None) -> None:
            with _lock:
                self.calls += 1
            emit({"event": "step", "node": self.node(metadata), "calls": self.calls,
                  "tokensIn": self.tokens_in, "tokensOut": self.tokens_out})

        def on_chat_model_start(self, serialized: Any, messages: Any, *, metadata: dict | None = None, **kwargs: Any) -> None:
            self._step(metadata)

        def on_llm_start(self, serialized: Any, prompts: Any, *, metadata: dict | None = None, **kwargs: Any) -> None:
            self._step(metadata)

        def on_llm_end(self, response: Any, **kwargs: Any) -> None:
            try:
                message = response.generations[0][0].message
            except (AttributeError, IndexError, TypeError):
                return
            usage = getattr(message, "usage_metadata", None) if isinstance(message, AIMessage) else None
            if usage:
                with _lock:
                    self.tokens_in += usage.get("input_tokens", 0)
                    self.tokens_out += usage.get("output_tokens", 0)

        def on_tool_start(self, serialized: Any, input_str: str, *, metadata: dict | None = None, **kwargs: Any) -> None:
            name = (serialized or {}).get("name") if isinstance(serialized, dict) else None
            emit({"event": "tool", "node": self.node(metadata), "name": name or ""})

    request = json.load(sys.stdin)
    config = DEFAULT_CONFIG.copy()
    config.update({
        "llm_provider": request["provider"],
        "deep_think_llm": request["deepModel"],
        "quick_think_llm": request["quickModel"],
        "max_debate_rounds": int(request.get("debateRounds", 1)),
        "max_risk_discuss_rounds": int(request.get("debateRounds", 1)),
        "output_language": request.get("language", "German"),
        "results_dir": request["workDir"] + "/logs",
        "data_cache_dir": request["workDir"] + "/cache",
        "memory_log_path": request["workDir"] + "/memory/trading_memory.md",
    })

    progress = Progress()
    graph = TradingAgentsGraph(selected_analysts=tuple(request["analysts"]), config=config, callbacks=[progress])
    state, rating = graph.propagate(request["ticker"], request["date"], asset_type=request.get("assetType", "stock"))

    def text(key: str) -> str:
        value = state.get(key)
        return value if isinstance(value, str) else ""

    def history(key: str) -> str:
        value = state.get(key) or {}
        return value.get("history", "") if isinstance(value, dict) else ""

    emit({
        "event": "done",
        "rating": rating,
        "reports": {
            "decision": text("final_trade_decision"),
            "market": text("market_report"),
            "sentiment": text("sentiment_report"),
            "news": text("news_report"),
            "fundamentals": text("fundamentals_report"),
            "debate": history("investment_debate_state"),
            "plan": text("investment_plan"),
            "trader": text("trader_investment_plan"),
            "risk": history("risk_debate_state"),
        },
        "stats": {"calls": progress.calls, "tokensIn": progress.tokens_in, "tokensOut": progress.tokens_out},
    })
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - every failure must reach KandleOS as one readable line
        traceback.print_exc(file=sys.stderr)
        emit({"event": "error", "message": f"{type(error).__name__}: {error}"})
        sys.exit(1)
