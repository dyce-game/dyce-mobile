// Ben (API) shows a QR request of Ð1,500 to anyone; the code goes into ${output.requestCode}.
var res = http.post(API_URL + '/wallet/requests', {
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + BEN_TOKEN },
  body: JSON.stringify({ amountKobo: 150000, note: 'Suya', delivery: 'qr' }),
});
if (!res.ok) throw new Error('Ben could not create a request: ' + res.status + ' ' + res.body);
var made = json(res.body);
output.requestCode = (made.request || made).code;
