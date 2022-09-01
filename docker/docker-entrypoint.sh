#!/bin/sh
#

NODEJS_ARGS=""

if [ -n "${DEBUG_PORT}" ]; then
	VALIDATED_DEBUG_PORT=$(echo -n "${DEBUG_PORT}" | grep '^[0-9]*$')
	if [ -z "${VALIDATED_DEBUG_PORT}" ]; then
		echo "Wrong DEBUG_PORT value '${DEBUG_PORT}'. Expected valid port number like '9229'." >&2
		exit 1
	fi

	if [ "${DEBUG_WAIT}" == "yes" ]; then
		NODEJS_ARGS="${NODEJS_ARGS} --inspect-brk=0.0.0.0:${VALIDATED_DEBUG_PORT}"
	else
		NODEJS_ARGS="${NODEJS_ARGS} --inspect=0.0.0.0:${VALIDATED_DEBUG_PORT}"
	fi
fi


if [ -n "${DO_INIT_SLEEP}" ]; then
	DO_INIT_SLEEP=$(( ${DO_INIT_SLEEP} + 0 ))
	if [ ${DO_INIT_SLEEP} -gt 0 ]; then
		echo "Initial sleep ${DO_INIT_SLEEP} seconds..."
		while [ ${DO_INIT_SLEEP} -gt 0 ]; do
			DO_INIT_SLEEP=$(( ${DO_INIT_SLEEP} - 1 ))
			sleep 1
		done
	fi
fi


exec node ${NODEJS_ARGS} /usr/local/zxteamorg/messenger-bridge/bin/app.js $*
