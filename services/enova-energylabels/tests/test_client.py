from pathlib import Path

import httpx
import pytest

from enova.client import EnovaApiError, EnovaClient, parse_csv

FIXTURES = Path(__file__).parent / "fixtures"
BLOB = "https://stemsenergyplanprodnoea.blob.core.windows.net/bankfiles/x.csv?sig=abc"


def _client(handler) -> EnovaClient:
    return EnovaClient(
        base_url="https://api.data.enova.no/ems/offentlige-data",
        endpoint="Fil",
        api_key="KEY",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_two_hop_envelope_then_csv_v2():
    csv_text = (FIXTURES / "sample_bankfile.csv").read_text(encoding="utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.data.enova.no":
            assert request.headers["x-api-key"] == "KEY"
            assert request.url.path.endswith("/v2/Fil/2026/1")  # 2026 -> v2
            return httpx.Response(200, json={"bankFileUrl": BLOB})
        assert request.url.host.endswith("blob.core.windows.net")
        return httpx.Response(200, text=csv_text)

    rows = list(_client(handler).iter_month(2026, 1))
    assert len(rows) == 3 and rows[0]["Energikarakter"] == "C"


def test_pre_2026_uses_v1():
    csv_text = (FIXTURES / "sample_bankfile_v1.csv").read_text(encoding="utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.data.enova.no":
            assert request.url.path.endswith("/v1/Fil/2015/6")  # 2015 -> v1
            return httpx.Response(200, json={"bankFileUrl": BLOB})
        return httpx.Response(200, text=csv_text)

    rows = list(_client(handler).iter_month(2015, 6))
    assert len(rows) == 2
    assert rows[0]["Oppvarmingskarakter"] == "Lightgreen"  # v1 has the colour scale


def test_pre_2026_month_404_yields_nothing():
    assert list(_client(lambda req: httpx.Response(404, json={"detail": "..."})).iter_month(2015, 6)) == []


def test_future_month_400_yields_nothing():
    client = _client(lambda req: httpx.Response(400, text="Cannot query date in the future."))
    assert list(client.iter_month(2030, 1)) == []


def test_auth_error_is_fatal():
    with pytest.raises(EnovaApiError):
        list(_client(lambda req: httpx.Response(401, text="unauthorized")).iter_month(2026, 1))


def test_missing_bank_file_url_yields_nothing():
    assert list(_client(lambda req: httpx.Response(200, json={"fromDate": "x"})).iter_month(2026, 1)) == []


def test_parse_csv_handles_quoted_commas():
    rows = parse_csv((FIXTURES / "sample_bankfile_v1.csv").read_text(encoding="utf-8"))
    assert rows[0]["GateAdresse"] == "SLYNGVEIEN,4,E"  # embedded commas in quotes
