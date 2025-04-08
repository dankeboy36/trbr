export interface PanicInfo {
    coreId: number;
    faultAddr: number;
    exceptionCause: number;
    regs: Record<string, number>;
}

export interface RiscvPanicInfo extends PanicInfo {
    stackBaseAddr: number;
    stackData: Buffer;
    target: 'esp32c2' | 'esp32c3' | 'esp32c6' | 'esp32h2' | 'esp32h4';
}

export interface XtensaPanicInfo extends PanicInfo {
    backtraceAddrs: number[];
}