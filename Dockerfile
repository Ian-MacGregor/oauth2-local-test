FROM quay.io/keycloak/keycloak:26.7
COPY keycloak-setup/ /opt/keycloak/data/import/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start-dev", "--import-realm"]
