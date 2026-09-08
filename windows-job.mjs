/**
 * [INPUT]: 依赖 Harness 已携带的 koffi 与 Windows Job Object 原生 API
 * [OUTPUT]: 将 launcher 及其后代加入随进程关闭的 Job，异常退出也回收 Host/工具
 * [POS]: 仅由 Windows launcher 在启动子进程前加载，不改变 Harness 的工具权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import koffi from 'koffi'

const kernel = koffi.load('kernel32.dll')
const basic = koffi.struct('OWNDSH_JOB_BASIC_LIMIT', {
  PerProcessUserTimeLimit: 'int64', PerJobUserTimeLimit: 'int64', LimitFlags: 'uint32',
  MinimumWorkingSetSize: 'size_t', MaximumWorkingSetSize: 'size_t', ActiveProcessLimit: 'uint32',
  Affinity: 'uintptr', PriorityClass: 'uint32', SchedulingClass: 'uint32',
})
const extended = koffi.struct('OWNDSH_JOB_EXTENDED_LIMIT', {
  BasicLimitInformation: basic,
  IoInfo: koffi.array('uint64', 6),
  ProcessMemoryLimit: 'size_t', JobMemoryLimit: 'size_t',
  PeakProcessMemoryUsed: 'size_t', PeakJobMemoryUsed: 'size_t',
})
const create = kernel.func('void * __stdcall CreateJobObjectW(void *, void *)')
const configure = kernel.func('int __stdcall SetInformationJobObject(void *, int, void *, uint32)')
const assign = kernel.func('int __stdcall AssignProcessToJobObject(void *, void *)')
const current = kernel.func('void * __stdcall GetCurrentProcess()')
const lastError = kernel.func('uint32 __stdcall GetLastError()')
const limits = Buffer.alloc(koffi.sizeof(extended))
// KILL_ON_JOB_CLOSE；不设置 CPU、内存、时长或子进程数量上限。
limits.writeUInt32LE(0x2000, koffi.offsetof(basic, 'LimitFlags'))
const job = create(null, null)
if (!job || !configure(job, 9, limits, limits.length) || !assign(job, current())) {
  throw new Error(`Cannot contain Harness process tree: Win32 ${lastError()}`)
}
// 句柄不继承、不提前关闭；Windows 在 launcher 退出时关闭它并清理所有后代。
