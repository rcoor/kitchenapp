import httpx
import pytest

from enova.client import EnovaApiError, EnovaClient, parse_file_body


def _make_client(handler) -> EnovaClient:
    transport = httpx.MockTransport(handler)
    return EnovaClient(
        base_url="https://api.data.enova.no/ems/offentlige-data/v2",
        endpoint="Fil",
        api_key="KEY",
        client=httpx.Client(transport=transport),
    )


def test_get_month_sends_key_and_parses_array():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/ems/offentlige-data/v2/Fil/2026/1"
        assert request.headers["x-api-key"] == "KEY"
        return httpx.Response(200, json=[{"attestnummer": "A1"}, {"attestnummer": "A2"}])

    client = _make_client(handler)
    rows = list(client.iter_month(2026, 1))
    assert [r["attestnummer"] for r in rows] == ["A1", "A2"]


def test_404_month_yields_nothing():
    client = _make_client(lambda req: httpx.Response(404, text="not found"))
    assert list(client.iter_month(2099, 1)) == []


def test_auth_error_is_fatal():
    client = _make_client(lambda req: httpx.Response(401, text="unauthorized"))
    with pytest.raises(EnovaApiError):
        list(client.iter_month(2026, 1))


def test_envelope_wrapped_file_is_unwrapped():
    client = _make_client(
        lambda req: httpx.Response(200, json={"Energiattestene": [{"attestnummer": "X1"}]})
    )
    assert [r["attestnummer"] for r in client.iter_month(2026, 1)] == ["X1"]


def test_parse_file_body_handles_ndjson():
    text = '{"attestnummer": "A1"}\n{"attestnummer": "A2"}\n\n'
    rows = parse_file_body(text)
    assert [r["attestnummer"] for r in rows] == ["A1", "A2"]


def test_parse_file_body_empty():
    assert parse_file_body("") == []
    assert parse_file_body("   ") == []
