@echo off
echo ============================================================
echo  FASE 2.5.2 - Latency Benchmark con Cross-Encoder Optimizado
echo  TopInput=6 + Warmup en arranque del servidor
echo ============================================================
set ENABLE_NEURAL_RERANKER=true
set NEURAL_RERANKER_MODEL=Xenova/bge-reranker-base
set NEURAL_TOP_INPUT=6
set NEURAL_TOP_OUTPUT=2
set BENCHMARK_LABEL=CE-TopInput6-TopOut2-Warmup
set NEURAL_MODE=true
node tests/test_latency_benchmark.js
