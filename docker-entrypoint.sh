#!/bin/sh
set -e

# Accept an optional first argument to select transport mode
# - "http" or "streamable": Streamable HTTP
# - "stdio": stdio transport
# Defaults to HTTP if nothing specified and MCP_TRANSPORT not set

MODE="$1"
case "$MODE" in
  http|streamable)
    export MCP_TRANSPORT=http
    shift
    ;;
  stdio)
    export MCP_TRANSPORT=stdio
    shift
    ;;
  *)
    : # leave MCP_TRANSPORT as-is
    ;;
esac

if [ -z "$MCP_TRANSPORT" ]; then
  export MCP_TRANSPORT=http
fi

exec node src/index.js "$@"

