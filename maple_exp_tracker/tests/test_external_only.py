"""Checks, from the program's own source code, that the tracker stays OUTSIDE the game.

It fails if the code ever starts to:
  * open the game's process or read/write its memory,
  * hook the keyboard or mouse, or send key presses / clicks / messages to any window,
  * start other programs or load other code (subprocess, os.system, eval, exec, importlib, ...),
  * use the network at all,
  * read pictures or data in a way that can run code (pickle).
It also lists every Windows function the program uses, so you can read exactly what it asks Windows for.

Run:  python tests/test_external_only.py
"""

import ast
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROGRAM = ["maple_tracker.py", "exp_tracker.py", "screen_reader.py", "winapi.py", "gfx.py", "view.py", "themes.py", "chat_reader.py", "market.py"]
sources = {f: open(os.path.join(ROOT, f), encoding="utf-8").read() for f in PROGRAM}
trees = {f: ast.parse(s) for f, s in sources.items()}



def docstring_ids(tree):
    return {id(n.body[0].value) for n in ast.walk(tree)
            if isinstance(n, (ast.Module, ast.FunctionDef, ast.ClassDef)) and n.body and isinstance(n.body[0], ast.Expr)
            and isinstance(getattr(n.body[0], "value", None), ast.Constant)}


def code_words(tree):
    """Every identifier, attribute name, import name and (non-docstring) string literal in the code."""
    skip, words = docstring_ids(tree), set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name):
            words.add(n.id)
        elif isinstance(n, ast.Attribute):
            words.add(n.attr)
        elif isinstance(n, (ast.FunctionDef, ast.ClassDef)):
            words.add(n.name)
        elif isinstance(n, ast.alias):
            words.add(n.name)
        elif isinstance(n, ast.arg):
            words.add(n.arg)
        elif isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in skip:
            words.add(n.value)
    return words


words = {f: code_words(t) for f, t in trees.items()}
ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}  {detail}")


# ---------------------------------------------------------------- 1. Windows functions
print("1) the Windows functions the program asks for")
ALLOWED_WINDOWS = {
    # looking at windows (titles, size, position), the way an Alt-Tab switcher does
    "EnumWindows", "IsWindow", "IsWindowVisible", "IsIconic", "GetClassNameW", "GetWindowTextW", "GetWindowLongW",
    "GetClientRect", "ClientToScreen", "GetForegroundWindow", "GetWindowThreadProcessId",
    # one copy at a time
    "CreateMutexW",
    # this program's own priority (GetCurrentProcess returns a stand-in for "this program"; it opens nothing)
    "GetCurrentProcess", "SetPriorityClass",
    # hotkeys
    "RegisterHotKey", "UnregisterHotKey", "SetTimer", "GetMessageW",
}
used = set(m.group(2) for m in re.finditer(r"_api\(_(user32|kernel32)\.(\w+)", sources["winapi.py"]))
for fn in sorted(used):
    print(f"        {fn}")
check("only these Windows functions are used, nothing else", used == ALLOWED_WINDOWS, (used ^ ALLOWED_WINDOWS))
dpi = set(re.findall(r"windll\.(?:shcore|user32)\.(\w+)", sources["winapi.py"]))
check("plus the two screen-scaling (DPI) calls", dpi <= {"SetProcessDpiAwareness", "SetProcessDPIAware"}, dpi)
check("no other way of reaching Windows (no other DLLs, no COM)",
      len(re.findall(r"WinDLL\(|windll\.|oledll|OleDLL|CDLL|cdll\.", sources["winapi.py"])) == 2 + len(dpi) and
      not any("ctypes" in s for f, s in sources.items() if f != "winapi.py"),
      "ctypes is used outside winapi.py, or an extra DLL is loaded")

# ---------------------------------------------------------------- 2. never these
print("2) things it must never do (searched in all of the program's code)")
FORBIDDEN = {
    "reading or writing another program's memory": ["ReadProcessMemory", "WriteProcessMemory", "VirtualAlloc", "VirtualProtect",
                                                     "VirtualQuery", "NtReadVirtualMemory", "NtWriteVirtualMemory", "MiniDumpWriteDump"],
    "opening or inspecting the game's process": ["OpenProcess", "OpenThread", "CreateToolhelp32Snapshot", "Process32", "Module32",
                                                  "EnumProcesses", "EnumProcessModules", "QueryFullProcessImageName", "GetModuleFileNameEx",
                                                  "psutil", "NtQuerySystemInformation", "NtOpenProcess"],
    "injecting code or starting threads in another program": ["CreateRemoteThread", "SetThreadContext", "QueueUserAPC", "LoadLibrary",
                                                              "GetProcAddress", "SetWindowsHookEx", "SetWinEventHook", "DLL_PROCESS"],
    "reading or faking keyboard and mouse": ["GetAsyncKeyState", "GetKeyState", "GetKeyboardState", "keybd_event", "SendInput", "mouse_event",
                                             "SetCursorPos", "BlockInput", "RegisterRawInputDevices", "GetRawInputData", "pynput", "pyautogui",
                                             "WH_KEYBOARD", "WH_MOUSE"],
    "sending messages to other windows": ["PostMessage", "SendMessage", "PostThreadMessage", "SendNotifyMessage", "SetForegroundWindow",
                                          "SetWindowPos", "ShowWindow", "BringWindowToTop", "SetParent", "CloseWindow", "DestroyWindow", "TerminateProcess"],
    "touching game files or the registry": ["winreg", "RegSetValue", "RegCreateKey", "RegOpenKey", "RegDeleteKey", "CreateFileW", "DeleteFileW", "MoveFileEx"],
    "starting other programs": ["CreateProcess", "ShellExecute", "WinExec", "subprocess", "Popen", "startfile", "popen", "spawn",
                                "pytesseract", "webbrowser"],
}
for what, names in FORBIDDEN.items():
    hits = sorted({(f, n) for f, ws in words.items() for n in names for w in ws if n in w})
    check(f"never: {what}", not hits, hits)

# ---------------------------------------------------------------- 3. imports
print("3) the only Python packages it imports")
STDLIB_OK = {"csv", "ctypes", "difflib", "json", "math", "os", "re", "queue", "sys", "threading", "time", "traceback", "datetime", "pathlib", "collections", "__future__"}
THIRD_PARTY_OK = {"cv2", "numpy", "mss", "PIL", "tkinter"}                  # image reading, screen capture, the window
LOCAL = {"exp_tracker", "screen_reader", "winapi", "gfx", "view", "themes", "chat_reader", "market"}
imported = {}
for f, tree in trees.items():
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                imported.setdefault(a.name.split(".")[0], set()).add(f)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.setdefault(node.module.split(".")[0], set()).add(f)
for mod in sorted(imported):
    kind = "own file" if mod in LOCAL else "package" if mod in THIRD_PARTY_OK else "standard library"
    print(f"        {mod:12} ({kind})")
extra = sorted(set(imported) - STDLIB_OK - THIRD_PARTY_OK - LOCAL)
check("nothing else is imported (no network, process, archive or code-loading modules)", not extra, extra)
check("ctypes (the way to reach Windows) is only in winapi.py", imported.get("ctypes") == {"winapi.py"}, imported.get("ctypes"))

# ---------------------------------------------------------------- 4. code that builds code
print("4) no code that writes or runs other code")
DANGEROUS_CALLS = {"eval", "exec", "compile", "__import__", "import_module", "system", "popen", "startfile", "Popen", "check_output", "check_call"}
DANGEROUS_LOADERS = {"pickle", "cPickle", "marshal", "shelve", "dill", "cloudpickle", "yaml", "joblib"}


def dangerous_calls(tree):
    """Calls that build or run code. re.compile (it only prepares a text pattern; it can't run anything) is the one exception."""
    found = []
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call):
            continue
        name = getattr(n.func, "id", getattr(n.func, "attr", ""))
        is_regex = (isinstance(n.func, ast.Attribute) and name == "compile" and isinstance(n.func.value, ast.Name) and n.func.value.id == "re")
        if name in DANGEROUS_CALLS and not is_regex:
            found.append((name, n.lineno))
    return found


bad_calls = [(f, name, line) for f, tr in trees.items() for name, line in dangerous_calls(tr)]
check("no eval / exec / compile / __import__ / system / popen / process launching", not bad_calls, bad_calls)
check("(the audit itself) a real compile(), exec(), eval() or os.system() IS caught, while re.compile() is allowed",
      len(dangerous_calls(ast.parse("compile(s, 'f', 'exec')\nexec(s)\neval(s)\nos.system(s)\nbuiltins.compile(s, 'f', 'exec')"))) == 5
      and dangerous_calls(ast.parse("import re\nre.compile('x')")) == [])
loaders = sorted({(f, w) for f, ws in words.items() for w in ws if w in DANGEROUS_LOADERS})
check("nothing that can load and run saved code (pickle, marshal, shelve, yaml ...)", not loaders, loaders)
loads = [(f, n.lineno, ast.unparse(n)) for f, t in trees.items() for n in ast.walk(t)
         if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "load" and isinstance(n.func.value, ast.Name) and n.func.value.id == "np"]
check("every numpy file load has pickling switched off", loads and all("allow_pickle=False" in u for _, _, u in loads), loads)

# ---------------------------------------------------------------- 5. no network
print("5) no network")
urls = []
for f, tree in trees.items():
    docstrings = {id(n.body[0].value) for n in ast.walk(tree)
                  if isinstance(n, (ast.Module, ast.FunctionDef, ast.ClassDef)) and n.body and isinstance(n.body[0], ast.Expr)
                  and isinstance(getattr(n.body[0], "value", None), ast.Constant)}
    for n in ast.walk(tree):
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings and re.search(r"https?://|ftp://|www\.", n.value):
            urls.append((f, n.value[:60]))
check("no web address anywhere in the code (only in comments/docs)", not urls, urls)
check("no network-capable module is imported",
      not ({"socket", "ssl", "http", "urllib", "requests", "ftplib", "smtplib", "telnetlib", "xmlrpc", "asyncio", "aiohttp"} & set(imported)))

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
