"""
Adds a request_id to every request and exposes it on responses.

Logs in prod include this id, so an admin reading a Sentry issue or a support
ticket can find every log line for that request without grep gymnastics.
"""

import uuid

from django.utils.deprecation import MiddlewareMixin

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(MiddlewareMixin):
    def process_request(self, request):
        rid = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        request.request_id = rid

    def process_response(self, request, response):
        rid = getattr(request, "request_id", None)
        if rid:
            response[REQUEST_ID_HEADER] = rid
        return response
