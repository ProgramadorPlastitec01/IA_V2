@echo off
echo Iniciando servidor con ENABLE_NEURAL_RERANKER=true y TopInput=6...
set ENABLE_NEURAL_RERANKER=true
set NEURAL_RERANKER_MODEL=Xenova/bge-reranker-base
set NEURAL_TOP_INPUT=6
set NEURAL_TOP_OUTPUT=4
node server.js
