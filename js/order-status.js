export const ORDER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["accepted", "rejected"]),
  accepted: Object.freeze(["preparing"]),
  preparing: Object.freeze(["ready"]),
  ready: Object.freeze(["completed"]),
  completed: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export function canTransition(from, to) {
  return Boolean(ORDER_TRANSITIONS[from]?.includes(to));
}

export function canCustomerCancel(status) {
  return status === "pending";
}
