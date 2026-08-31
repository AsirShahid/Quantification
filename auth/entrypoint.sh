#!/bin/sh
set -eu

fail() {
    printf '%s\n' "kidneyquant-auth: $1" >&2
    exit 1
}

assertion_file=${KIDNEYQUANT_PROXY_ASSERTION_FILE:-/run/secrets/kidneyquant-proxy-assertion}
trusted_cidr=${KIDNEYQUANT_TRUSTED_PROXY_CIDR:-}
template=/etc/nginx/templates/kidneyquant.conf.template
rendered=/tmp/nginx.conf

[ -r "$assertion_file" ] || fail "proxy assertion file is not readable"
[ -r "$template" ] || fail "nginx template is not readable"

KIDNEYQUANT_PROXY_ASSERTION=''
{
    if ! IFS= read -r KIDNEYQUANT_PROXY_ASSERTION; then
        [ -n "$KIDNEYQUANT_PROXY_ASSERTION" ] || fail "proxy assertion file is empty"
    fi
    if IFS= read -r extra_line; then
        fail "proxy assertion must contain exactly one line"
    fi
} < "$assertion_file"

assertion_length=${#KIDNEYQUANT_PROXY_ASSERTION}
[ "$assertion_length" -ge 43 ] && [ "$assertion_length" -le 128 ] \
    || fail "proxy assertion must be 43-128 base64url characters"
case "$KIDNEYQUANT_PROXY_ASSERTION" in
    *[!A-Za-z0-9_-]*) fail "proxy assertion must use base64url characters only" ;;
esac

[ -n "$trusted_cidr" ] || fail "KIDNEYQUANT_TRUSTED_PROXY_CIDR is required"
case "$trusted_cidr" in
    *[!0-9A-Fa-f:./]*) fail "trusted proxy CIDR contains invalid characters" ;;
    */*) ;;
    *) fail "trusted proxy must be expressed as a CIDR" ;;
esac
trusted_address=${trusted_cidr%/*}
trusted_prefix=${trusted_cidr##*/}
[ -n "$trusted_address" ] && [ -n "$trusted_prefix" ] \
    || fail "trusted proxy CIDR is incomplete"
case "$trusted_address" in
    */*) fail "only one trusted proxy CIDR is accepted" ;;
esac
case "$trusted_prefix" in
    *[!0-9]*) fail "trusted proxy prefix must be numeric" ;;
esac
case "$trusted_address" in
    *:*) [ "$trusted_prefix" -le 128 ] || fail "IPv6 proxy prefixes must be at most 128" ;;
    *.*) [ "$trusted_prefix" -le 32 ] || fail "IPv4 proxy prefixes must be at most 32" ;;
    *) fail "trusted proxy CIDR must contain an IPv4 or IPv6 address" ;;
esac

umask 077
export KIDNEYQUANT_PROXY_ASSERTION
export KIDNEYQUANT_TRUSTED_PROXY_CIDR
envsubst '${KIDNEYQUANT_PROXY_ASSERTION} ${KIDNEYQUANT_TRUSTED_PROXY_CIDR}' < "$template" > "$rendered"
unset KIDNEYQUANT_PROXY_ASSERTION KIDNEYQUANT_TRUSTED_PROXY_CIDR trusted_cidr extra_line

exec nginx -c "$rendered" -g 'daemon off;'
