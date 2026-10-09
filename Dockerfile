FROM langchain/langgraphjs-api:24
ADD . /deps/generative-ai
ENV LANGSERVE_GRAPHS='{"agent":"./apps/api/src/agent.ts:graph"}'
ENV LANGGRAPH_AUTH='{"path":"./apps/api/src/auth.ts:auth","disable_studio_auth":true}'
ENV LANGGRAPH_HTTP='{"disable_assistants":false,"disable_threads":false,"disable_runs":false,"disable_store":false,"disable_meta":false,"cors":{"allow_origins":["http://localhost:5173","https://smith.langchain.com"]}}'
WORKDIR /deps/generative-ai
RUN pnpm i --frozen-lockfile
RUN (test ! -f /api/langgraph_api/js/build.mts && echo "Prebuild script not found, skipping") || tsx /api/langgraph_api/js/build.mts