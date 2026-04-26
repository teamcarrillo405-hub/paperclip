#!/bin/bash
curl -sf http://localhost:${PORT:-3100}/api/health || exit 1
