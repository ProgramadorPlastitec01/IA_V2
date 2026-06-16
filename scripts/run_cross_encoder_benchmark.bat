@echo off
set ENABLE_NEURAL_RERANKER=true
set NEURAL_RERANKER_MODEL=Xenova/bge-reranker-base
set NEURAL_TOP_INPUT=8
set NEURAL_TOP_OUTPUT=4
node tests/test_cross_encoder_benchmark.js
