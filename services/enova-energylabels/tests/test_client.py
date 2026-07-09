import httpx
import pytest

from enova.client import EnovaApiError, EnovaClient


def _make_client(handler) -> EnovaClient:
    transport = httpx.MockTransport(handler)
    return EnovaClient(
        base_url="https://api.example/ems/offentlige-data/v1",
        endpoint="Energiattest",
        api_key="KEY",
        page_size=3,
        max_pages=10,
        client=httpx.Client(transport=transport),
    )


def test_paginates_until_short_page():
    def handler(request: httpx.Request) -> httpx.Response:
        body = httpx.Request("POST", request.url, content=request.content)
        import json

        payload = json.loads(request.content)
        assert request.headers["Ocp-Apim-Subscription-Key"] == "KEY"
        assert payload["Kommunenummer"] == "0301"
        page = payload["Side"]
        if page == 1:
            return httpx.Response(200, json=[{"attestnummer": f"A{i}"} for i in range(3)])
        if page == 2:
            return httpx.Response(200, json=[{"attestnummer": "A3"}])  # short -> stop
        return httpx.Response(200, json=[])

    client = _make_client(handler)
    rows = list(client.iter_attester("0301"))
    assert [r["attestnummer"] for r in rows] == ["A0", "A1", "A2", "A3"]


def test_envelope_wrapped_results_are_unwrapped():
    def handler(request: httpx.Request) -> httpx.Response:
        import json

        page = json.loads(request.content)["Side"]
        if page == 1:
            return httpx.Response(200, json={"Energiattestene": [{"attestnummer": "X1"}]})
        return httpx.Response(200, json={"Energiattestene": []})

    client = _make_client(handler)
    rows = list(client.iter_attester("0301"))
    assert [r["attestnummer"] for r in rows] == ["X1"]


def test_first_page_error_is_fatal():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="unauthorized")

    client = _make_client(handler)
    with pytest.raises(EnovaApiError):
        list(client.iter_attester("0301"))


def test_later_page_error_ends_pagination():
    def handler(request: httpx.Request) -> httpx.Response:
        import json

        page = json.loads(request.content)["Side"]
        if page == 1:
            return httpx.Response(200, json=[{"attestnummer": f"A{i}"} for i in range(3)])
        return httpx.Response(500, text="boom")

    client = _make_client(handler)
    rows = list(client.iter_attester("0301"))
    assert len(rows) == 3  # page 1 kept, page-2 error just stops
