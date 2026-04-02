#!/usr/bin/env node
/**
 * Pi SDK ACP Adapter
 *
 * ACP-compliant adapter that embeds the Pi coding agent SDK directly
 * instead of spawning a subprocess. This avoids loading ~100MB of TUI
 * code that the CLI pulls in even in headless mode.
 *
 * Speaks ACP JSON-RPC over stdin/stdout using @agentclientprotocol/sdk.
 * Internally calls createAgentSession() from @mariozechner/pi-coding-agent.
 */
export {};
