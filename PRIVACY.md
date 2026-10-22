# Privacy / 隐私说明

CAD Viewer 0.2.0 reads only a CAD file explicitly selected in its UI or supplied to its read-only tool. The default path boundary is the user's home and launch working directory, configurable with `CAD_VIEWER_ALLOWED_ROOTS`.

STEP conversion runs in a local worker. STL parsing runs locally. No conversion cloud, telemetry, advertising, account service, or payment service is called by this plugin. Input CAD files are not modified or copied to persistent plugin storage. Models remain in process / page memory until replaced or the process / page is closed; normal host logs, conversation retention, operating-system memory management, and crash handling are outside this plugin's control.

When used through ChatGPT or another MCP host, the host receives tool input and output, including a model summary and the display mesh supplied as UI metadata. Selected measurement coordinates can be sent to the host as model context. The host's data policies and settings apply. Local conversion is not a promise that files or derived geometry never pass through the host.

The optional browser preview binds only to 127.0.0.1, checks its Host and Origin, and does not offer a remote file-path endpoint. It exposes the initially selected mesh to local requests on its port while running. Stop that process to end preview access.

The UI stores only your manually selected language (`zh` or `en`) in the viewer origin's local storage when the host allows it. It does not store CAD geometry, file paths, or measurements there. If storage is unavailable, language switching still works for the current page.

安装与构建会从所选的软件仓库下载依赖；运行中的插件本身不向第三方模型转换或统计服务发送文件。ChatGPT 宿主处理工具数据与显示网格的方式，应以用户账户与宿主设置为准。

Project issues: https://github.com/HappyGame137/cad-viewer-chatgpt/issues
