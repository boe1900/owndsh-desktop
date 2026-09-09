// [INPUT]: 依赖同目录内置 Node、相邻运行树中的官方 dsh CLI，以及调用方 argv/环境/标准流。
// [OUTPUT]: 提供 Windows 可直接启动的 dsh.exe，透传参数与官方命令退出码。
// [POS]: 桌面运行环境的命令入口，供官方无 shell subprocess 使用；不实现插件管理业务。
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    env, io,
    path::PathBuf,
    process::{self, Command, Stdio},
};

fn run() -> io::Result<i32> {
    let executable = env::current_exe()?;
    let bin = executable
        .parent()
        .ok_or_else(|| io::Error::other("dsh executable has no parent"))?;
    let script = bin.join("../node_modules/@deepseek-ai/dsh/lib/bin.js");
    // Node 的脚本参数不接受 Windows verbatim 路径；保留调用方 cwd 以遵循官方 CLI 语义。
    let script = match script.to_str() {
        Some(path) if path.starts_with(r"\\?\UNC\") => PathBuf::from(format!(r"\\{}", &path[8..])),
        Some(path) if path.starts_with(r"\\?\") => PathBuf::from(&path[4..]),
        _ => script,
    };
    let mut command = Command::new(bin.join("node.exe"));
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW：桌面操作不弹出控制台。
    let status = command
        .arg(script)
        .args(env::args_os().skip(1))
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()?;
    Ok(status.code().unwrap_or(1))
}

fn main() {
    match run() {
        Ok(code) => process::exit(code),
        Err(error) => {
            eprintln!("dsh: {error}");
            process::exit(1);
        }
    }
}
