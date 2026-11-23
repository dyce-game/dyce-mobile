// Runs in Maestro's script engine (or scripts/e2e/web-runner.mjs): Ben, the "second phone", pays the QR
// request Alice just created. Uses only the API, as the app would after a scan.
var auth = function (token) {
  return { 'content-type': 'application/json', authorization: 'Bearer ' + token };
};
var list = json(http.get(API_URL + '/wallet/requests', { headers: auth(ALICE_TOKEN) }).body);
var open = (list.requests || list.items || list).filter(function (r) {
  return r.status === 'open' || r.status === 'pending';
});
if (!open.length) throw new Error('Alice has no open payment request');
var code = open[0].code;
var res = http.post(API_URL + '/wallet/requests/' + code + '/pay', {
  headers: auth(BEN_TOKEN),
  body: JSON.stringify({ amountKobo: 200000, idempotencyKey: 'e2e-ben-' + code }),
});
if (!res.ok) throw new Error('Ben could not pay ' + code + ': ' + res.status + ' ' + res.body);
output.requestCode = code;
