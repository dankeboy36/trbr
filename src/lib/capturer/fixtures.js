// @ts-check

export const xtensaStoreProhibited = `Guru Meditation Error: Core  1 panic'ed (StoreProhibited). Exception was unhandled.

Core  1 register dump:
PC      : 0x400d15f1  PS      : 0x00060b30  A0      : 0x800d1609  A1      : 0x3ffb21d0
A2      : 0x0000002a  A3      : 0x3f40018f  A4      : 0x00000020  A5      : 0x0000ff00
A6      : 0x00ff0000  A7      : 0x00000022  A8      : 0x00000000  A9      : 0x3ffb21b0
A10     : 0x0000002c  A11     : 0x3f400164  A12     : 0x00000022  A13     : 0x0000ff00
A14     : 0x00ff0000  A15     : 0x0000002a  SAR     : 0x0000000c  EXCCAUSE: 0x0000001d
EXCVADDR: 0x00000000  LBEG    : 0x40086161  LEND    : 0x40086171  LCOUNT  : 0xfffffff5

Backtrace: 0x400d15ee:0x3ffb21d0 0x400d1606:0x3ffb21f0`

export const riscvLoadAccessFault = `Core  0 panic'ed (Load access fault). Exception was unhandled.

Core  0 register dump:
MEPC    : 0x4200007e  RA      : 0x4200007e  SP      : 0x3fc98300  GP      : 0x3fc8d000
TP      : 0x3fc98350  T0      : 0x4005890e  T1      : 0x3fc8f000  T2      : 0x00000000
S0/FP   : 0x420001ea  S1      : 0x3fc8f000  A0      : 0x00000001  A1      : 0x00000001
T3      : 0x3fc8f000  T4      : 0x00000001  T5      : 0x3fc8f000  T6      : 0x00000001
MSTATUS : 0x00001801  MTVEC   : 0x40380001  MCAUSE  : 0x00000005  MTVAL   : 0x00000000
MHARTID : 0x00000000

Stack memory:
3fc98300: 0x00000000 0x00000000 0x00000000 0x42001c4c 0x00000000 0x00000000 0x00000000 0x40385d20
3fc98320: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000`

export const riscvVarsDemoStoreAccessFault = `Guru Meditation Error: Core  0 panic'ed (Store access fault). Exception was unhandled.

Core  0 register dump:
MEPC    : 0x4200012e  RA      : 0x42000100  SP      : 0x3fc96ba0  GP      : 0x3fc8cc00
TP      : 0x3fc96ca0  T0      : 0x7f7f7fff  T1      : 0x7f7f7f7f  T2      : 0xffffffff
S0/FP   : 0x3fc96bf0  S1      : 0x000000fb  A0      : 0x0000000f  A1      : 0x3fc96bc4
A2      : 0x00000003  A3      : 0x00000065  A4      : 0x00000074  A5      : 0x000000fb
A6      : 0x02000800  A7      : 0x00000000  S2      : 0x00000095  S3      : 0x3fc96c0c
S4      : 0x3c030120  S5      : 0x00000000  S6      : 0x00000000  S7      : 0x00000000
S8      : 0x00000000  S9      : 0x00000000  S10     : 0x00000000  S11     : 0x00000000
T3      : 0x40200000  T4      : 0x00000000  T5      : 0x00000000  T6      : 0x00000000
MSTATUS : 0x00001881  MTVEC   : 0x40380001  MCAUSE  : 0x00000007  MTVAL   : 0x00000000
MHARTID : 0x00000000

Stack memory:
3fc96ba0: 0x00000000 0x00000000 0x3fc9701c 0x00000003 0x00000004 0x00000003 0x00000074 0x00000008
3fc96bc0: 0x0000000d 0x00000001 0x00000005 0x00000009 0x3c030294 0x00000000 0x00000000 0x00000000
3fc96be0: 0x00000000 0x00000000 0x3fc96c40 0x4200021e 0x3fc8da0c 0x00000002 0x3fc96c10 0x00000001
3fc96c00: 0x00000005 0x00000009 0x00000002 0x00000059 0x40300000 0x73726176 0x6d65645f 0x0000006f
3fc96c20: 0x00000000 0x00000007 0x0000000b 0xf817761f 0x00000000 0x00000000 0x3fc96c50 0x4200024c
3fc96c40: 0x00000000 0x3fc8e000 0x3fc96c60 0x420002dc 0x00000000 0x00000000 0x3fc96c70 0x42003592
3fc96c60: 0x00000000 0x00000000 0x00000000 0x40385e4c 0x00000000 0x00000000 0x00000000 0x00000000`

/**
 * Simulated monitor recording from a crash-loop sketch with alternating errors.
 * Timestamps emulate quiet periods between crash blocks.
 *
 * @returns {{ atMs: number; text: string }[]}
 */
export function createRecordedCrashLoop() {
  const mid = Math.floor(xtensaStoreProhibited.length / 2)
  return [
    { atMs: 0, text: '[I][capturer-sketch] booting\n' },
    { atMs: 120, text: xtensaStoreProhibited.slice(0, mid) },
    { atMs: 150, text: `${xtensaStoreProhibited.slice(mid)}\n` },
    { atMs: 520, text: '[W][capturer-sketch] rebooting after fault\n' },
    { atMs: 760, text: `${xtensaStoreProhibited}\n` },
    {
      atMs: 1030,
      text: '[I][capturer-sketch] switching mode to riscv fault\n',
    },
    { atMs: 2100, text: `${riscvLoadAccessFault}\n` },
  ]
}
