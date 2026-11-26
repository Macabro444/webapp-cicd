#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Envía un evento del pipeline CI/CD a OpenObserve (stream "cicd").
# Uso:  scripts/reportar-openobserve.sh <evento> <resultado> [json_extra]
#   evento:    pruebas_unitarias | pruebas_e2e | despliegue | despliegue_bloqueado
#   resultado: exito | fallo
#   json_extra: objeto JSON opcional con campos adicionales
# Requiere: OPENOBSERVE_URL y OPENOBSERVE_AUTH (Basic en base64)
# ─────────────────────────────────────────────────────────────
set -uo pipefail

EVENTO="${1:?falta evento}"
RESULTADO="${2:?falta resultado}"
EXTRA="${3:-}"
[ -z "$EXTRA" ] && EXTRA='{}'

if [ -z "${OPENOBSERVE_URL:-}" ] || [ -z "${OPENOBSERVE_AUTH:-}" ]; then
  echo "⚠ OPENOBSERVE_URL / OPENOBSERVE_AUTH no configurados; no se envía el evento."
  exit 0
fi

EVENTO_JSON=$(jq -n \
  --arg evento "$EVENTO" \
  --arg resultado "$RESULTADO" \
  --arg commit "${GITHUB_SHA:-local}" \
  --arg commit_corto "${GITHUB_SHA:0:7}" \
  --arg rama "${GITHUB_REF_NAME:-local}" \
  --arg usuario "${GITHUB_ACTOR:-local}" \
  --arg mensaje_commit "${COMMIT_MESSAGE:-}" \
  --arg repositorio "${GITHUB_REPOSITORY:-}" \
  --arg workflow "${GITHUB_WORKFLOW:-}" \
  --arg disparador "${GITHUB_EVENT_NAME:-}" \
  --arg run_id "${GITHUB_RUN_ID:-}" \
  --arg run_url "${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}" \
  --argjson extra "$EXTRA" \
  '[{
     evento: $evento, resultado: $resultado,
     commit: $commit, commit_corto: $commit_corto, rama: $rama,
     usuario: $usuario, mensaje_commit: $mensaje_commit,
     repositorio: $repositorio, workflow: $workflow, disparador: $disparador,
     run_id: $run_id, run_url: $run_url
   } + $extra]')

echo "▶ Enviando a OpenObserve: $EVENTO = $RESULTADO"
HTTP=$(curl -sS -o /tmp/oo-resp.txt -w "%{http_code}" \
  -X POST "${OPENOBSERVE_URL%/}/api/default/cicd/_json" \
  -H "Authorization: Basic ${OPENOBSERVE_AUTH}" \
  -H "Content-Type: application/json" \
  -d "$EVENTO_JSON")
echo "  respuesta HTTP $HTTP: $(cat /tmp/oo-resp.txt)"
# Un fallo al reportar no debe tumbar el pipeline
exit 0
