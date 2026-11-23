// Reads Alice's and Ben's wallet balances (kobo) and what is locked in open Pools, from the API.
// Results: output.aliceKobo, output.benKobo, output.aliceLockedKobo.
function wallet(token) {
  return json(
    http.get(API_URL + '/wallet', { headers: { authorization: 'Bearer ' + token } }).body,
  );
}
var a = wallet(ALICE_TOKEN);
var b = wallet(BEN_TOKEN);
output.aliceKobo = a.balanceKobo;
output.benKobo = b.balanceKobo;
output.aliceLockedKobo = a.locked ? a.locked.kobo : 0;
