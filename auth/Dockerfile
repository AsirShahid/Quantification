FROM nginxinc/nginx-unprivileged:1.28.0-alpine@sha256:c97ff0bf7cbae369953c6da1232ec14ad9f971d66360c5698db0856a4cd657a0

COPY --chown=10001:10001 nginx.conf /etc/nginx/templates/kidneyquant.conf.template
COPY --chown=10001:10001 --chmod=0555 entrypoint.sh /usr/local/bin/kidneyquant-auth-entrypoint

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/kidneyquant-auth-entrypoint"]
