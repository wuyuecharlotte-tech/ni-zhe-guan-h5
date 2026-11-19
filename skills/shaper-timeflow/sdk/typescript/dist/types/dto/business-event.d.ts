/**
 * A generic business fact explicitly registered by the owning application. The platform does not infer it from a stream, window or point operation.
 */
export interface BusinessEventRequest {
    streamKey: string;
    kind: string;
    eventTime: number;
    eventId: string;
    payload?: {};
}
//# sourceMappingURL=business-event.d.ts.map