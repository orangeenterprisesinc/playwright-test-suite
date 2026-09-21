// Relay mailboxes are environment, not test data: no scenario file names one.
export interface RelayConfig {
    url: string;
    /** The sending device's mailbox — lands in <DeviceWebMail>. */
    from: string;
    /** The office queue the Internet pull drains. */
    office: string;
    /** B1-002's scratch mailbox — never the office queue. */
    smoke: string;
}

export function relayConfig(): RelayConfig {
    return {
        url: process.env.DEVICE_RELAY_URL ?? '',
        from: process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1',
        office: process.env.DEVICE_RELAY_SERVER ?? '',
        smoke: process.env.DEVICE_RELAY_SMOKE ?? 'b1smoke@petb1',
    };
}
