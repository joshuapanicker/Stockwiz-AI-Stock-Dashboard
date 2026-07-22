# MALLOC_ARENA_MAX caps glibc to 2 malloc arenas instead of the default
# (8 × CPU count). The universe fetcher's thread pool otherwise fragments
# RSS across many arenas that never return memory to the OS — the main
# driver of the 512MB-container OOM. Belt-and-suspenders: also settable as
# a Railway service variable.
web: MALLOC_ARENA_MAX=2 uvicorn api.server:app --host 0.0.0.0 --port $PORT
