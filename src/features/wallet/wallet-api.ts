import type {
  CreatePaymentRequestInput,
  HistoryFilter,
  HistoryResponse,
  MoneyResult,
  PayPaymentRequestInput,
  PaymentRequestView,
  PaymentRequestsResponse,
  Receipt,
  SendMoneyRequest,
  WalletSummary,
  WeeklyActivity,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the wallet endpoints of dyce-backend (apps/api). */
export function createWalletApi(api: ApiClient) {
  return {
    summary: () => api.get<WalletSummary>('/wallet'),
    /** The free daily top-up (only when your balance is low). */
    topup: () => api.post<MoneyResult>('/wallet/topup'),
    /** `input.idempotencyKey` must be reused if you retry, so the money moves once. */
    send: (
      input: Pick<SendMoneyRequest, 'toUserId' | 'amountKobo' | 'idempotencyKey'> & {
        note?: string;
      },
    ) => api.post<MoneyResult>('/wallet/send', input),
    history: (filter: HistoryFilter, before?: string) =>
      api.get<HistoryResponse>(
        `/wallet/history?filter=${filter}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      ),
    /** The last 7 days of net movement (History bars, Top-up week grid). */
    weekly: () => api.get<WeeklyActivity>('/wallet/weekly'),
    receipt: (txnId: string) => api.get<Receipt>(`/wallet/transactions/${txnId}`),
    requests: () => api.get<PaymentRequestsResponse>('/wallet/requests'),
    createRequest: (
      input: Partial<
        Pick<CreatePaymentRequestInput, 'amountKobo' | 'note' | 'targetUserId' | 'delivery'>
      >,
    ) => api.post<PaymentRequestView>('/wallet/requests', input),
    /** What the Pay sheet shows: always from the server, never from the QR. */
    request: (code: string) => api.get<PaymentRequestView>(`/wallet/requests/${code}`),
    pay: (code: string, input: PayPaymentRequestInput) =>
      api.post<MoneyResult>(`/wallet/requests/${code}/pay`, input),
    cancel: (code: string) => api.post<void>(`/wallet/requests/${code}/cancel`),
  };
}

export type WalletApi = ReturnType<typeof createWalletApi>;
