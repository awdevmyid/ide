var apiUrl = localStorageGetItem("api-url") || "https://preview.api.judge0.com";
var wait = localStorageGetItem("wait") || false;
var pbUrl = "https://pb.judge0.com";
var check_timeout = 200;

var layout;

var sourceEditor;
var stdinEditor;
var stdoutEditor;

var isEditorDirty = false;
var currentLanguageId;

var $selectLanguage;
var $runBtn;
var $statusLine;

var timeStart;
var timeEnd;

var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: false
    },
    dimensions: {
        borderWidth: 3,
        headerHeight: 22
    },
    content: [{
        type: "row",
        content: [{
            type: "component",
            componentName: "source",
            title: "Program",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "column",
            content: [{
                type: "stack",
                content: [{
                    type: "component",
                    componentName: "stdin",
                    title: "Ulaz",
                    isClosable: false,
                    componentState: {
                        readOnly: false
                    }
                }]
            }, {
                type: "stack",
                content: [{
                        type: "component",
                        componentName: "stdout",
                        title: "Izlaz",
                        isClosable: false,
                        componentState: {
                            readOnly: true
                        }
                    }]
            }]
        }]
    }]
};

function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function localStorageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (ignorable) {
  }
}

function localStorageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (ignorable) {
    return null;
  }
}

function showApiUrl() {
    $("#api-url").attr("href", apiUrl);
}

function showError(title, content) {
    $("#site-modal #title").html(title);
    $("#site-modal .content").html(content);
    $("#site-modal").modal("show");
}

function handleError(jqXHR, textStatus, errorThrown) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR, textStatus, errorThrown) {
    handleError(jqXHR, textStatus, errorThrown);
    $runBtn.removeClass("loading");
}

function handleResult(data) {
    timeEnd = performance.now();
    console.log("It took " + (timeEnd - timeStart) + " ms to get submission result.");

    var status = data.status;
    var stdout = decode(data.stdout);
    var stderr = decode(data.stderr);
    var time = (data.time === null ? "-" : data.time + "s");
    var memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory}`);

    stdoutEditor.setValue([stdout, stderr].join(""));

    $runBtn.removeClass("loading");
}

function getIdFromURI() {
  return location.search.substr(1).trim();
}

function save() {
    var content = JSON.stringify({
        source_code: encode(sourceEditor.getValue()),
        language_id: $selectLanguage.val(),
        stdin: encode(stdinEditor.getValue()),
        stdout: encode(stdoutEditor.getValue()),
        status_line: encode($statusLine.html())
    });
    var filename = "judge0-ide.json";
    var data = {
        content: content,
        filename: filename
    };

    $.ajax({
        url: pbUrl,
        type: "POST",
        async: true,
        headers: {
            "Accept": "application/json"
        },
        data: data,
        success: function (data, textStatus, jqXHR) {
            if (getIdFromURI() != data["short"]) {
                window.history.replaceState(null, null, location.origin + location.pathname + "?" + data["short"]);
            }
        },
        error: function (jqXHR, textStatus, errorThrown) {
            handleError(jqXHR, textStatus, errorThrown);
        }
    });
}

function downloadSource() {
    var value = parseInt($selectLanguage.val());
    download(sourceEditor.getValue(), fileNames[value], "text/plain");
}

function loadSavedSource() {
    $.ajax({
        url: pbUrl + "/" + getIdFromURI() + ".json",
        type: "GET",
        success: function (data, textStatus, jqXHR) {
            sourceEditor.setValue(decode(data["source_code"]));
            $selectLanguage.dropdown("set selected", data["language_id"]);
            stdinEditor.setValue(decode(data["stdin"]));
            stdoutEditor.setValue(decode(data["stdout"]));
            $statusLine.html(decode(data["status_line"]));
            changeEditorLanguage();
        },
        error: function (jqXHR, textStatus, errorThrown) {
            showError("Greška", "Program nije pronađen!");
            window.history.replaceState(null, null, location.origin + location.pathname);
            loadRandomLanguage();
        }
    });
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        showError("Greška", "Program ne može biti prazan!");
        return;
    } else {
        $runBtn.addClass("loading");
    }

    stdoutEditor.setValue("");

    // Without this "replace" code https://code.stemalica.com/?BSu9 wouldn't work.
    // That code was copied from PPT file into editor on Windows.
    var sourceValue = encode(sourceEditor.getValue().replace(/\r\n/g, "\n").replace(/ /g, " "));
    var stdinValue = encode(stdinEditor.getValue().replace(/\r\n/g, "\n").replace(/ /g, " "));
    var languageId = $selectLanguage.val();
    var data = {
        source_code: sourceValue,
        language_id: languageId,
        stdin: stdinValue
    };

    timeStart = performance.now();
    $.ajax({
        url: apiUrl + `/submissions?base64_encoded=true&wait=${wait}`,
        type: "POST",
        async: true,
        contentType: "application/json",
        data: JSON.stringify(data),
        success: function (data, textStatus, jqXHR) {
            console.log(`Your submission token is: ${data.token}`);
            if (wait == true) {
                handleResult(data);
            } else {
                setTimeout(fetchSubmission.bind(null, data.token), check_timeout);
            }
        },
        error: handleRunError
    });
}

function fetchSubmission(submission_token) {
    $.ajax({
        url: apiUrl + "/submissions/" + submission_token + "?base64_encoded=true",
        type: "GET",
        async: true,
        success: function (data, textStatus, jqXHR) {
            if (data.status.id <= 2) { // In Queue or Processing
                setTimeout(fetchSubmission.bind(null, submission_token), check_timeout);
                return;
            }
            handleResult(data);
        },
        error: handleRunError
    });
}

function changeEditorLanguage() {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("mode"));
}

function insertTemplate() {
    currentLanguageId = parseInt($selectLanguage.val());
    sourceEditor.setValue(sources[currentLanguageId]);
    changeEditorLanguage();
}

function loadRandomLanguage() {
    $selectLanguage.dropdown("set selected", Math.floor(Math.random() * $selectLanguage[0].length));
    insertTemplate();
}

$(window).resize(function() {
    layout.updateSize();
});

$(document).ready(function () {
    console.log("Hey, Judge0 IDE is open-sourced: https://github.com/judge0/ide. Have fun!");

    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (e) {
        if (!isEditorDirty) {
            insertTemplate();
        } else {
            changeEditorLanguage();
        }
    });

    $runBtn = $("#run-btn");
    $runBtn.click(function (e) {
        run();
    });

    $statusLine = $("#status-line");

    $("body").keydown(function (e) {
        var keyCode = e.keyCode || e.which;
        if (keyCode == 120) { // F9
            e.preventDefault();
            run();
        } else if (event.ctrlKey && keyCode == 83) { // Ctrl+S
            e.preventDefault();
            save();
        }
    });

    $("select.dropdown").dropdown();
    $(".ui.dropdown").dropdown();
    $(".ui.dropdown.site-links").dropdown({action: "hide", on: "hover"});
    $(".ui.checkbox").checkbox();
    $(".message .close").on("click", function () {
        $(this).closest(".message").transition("fade");
    });

    showApiUrl();

    require(["vs/editor/editor.main"], function () {
        layout = new GoldenLayout(layoutConfig, $("#site-content"));

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "cpp"
            });

            sourceEditor.getModel().onDidChangeContent(function (e) {
                currentLanguageId = parseInt($selectLanguage.val());
                isEditorDirty = sourceEditor.getValue() != sources[currentLanguageId];
            });
        });

        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext"
            });
        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext"
            });
        });

        layout.on("initialised", function () {
            if (getIdFromURI()) {
                loadSavedSource();
            } else {
                loadRandomLanguage();
            }
        });

        layout.init();
    });
});

// Template Sources
var pythonSource = "print(\"Bok Stemalica!\")\n";

var sources = {
    71: pythonSource
};

var fileNames = {
    71: "main.py"
};
