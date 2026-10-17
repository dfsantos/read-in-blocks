# Testes dos hooks

Executar a partir da raiz do repositório (precisa de `python3`):

```
python3 .claude/hooks/tests/test_require_context7.py
python3 .claude/hooks/tests/test_validate_commit_msg.py
```

Rode sempre que alterar `require-context7.py`, `validate-commit-msg.py`, a lista de escopos, o `LIBRARY_IDS` ou a lista `trustedServers`. Desde a US-031 o agente não edita esta pasta: ele propõe a mudança e o responsável aplica (ADR-0015).
