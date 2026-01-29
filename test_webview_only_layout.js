"ui";

files.write("/sdcard/wo_1.txt", "Script started");

ui.layout(
    <vertical>
        <webview id="webView" layout_weight="1" w="*" h="*"/>
    </vertical>
);

files.write("/sdcard/wo_2.txt", "Layout with only webview created");

toast("Test done");
