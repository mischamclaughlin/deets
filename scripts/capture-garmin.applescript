-- Operate only Garmin's simulator and its native screenshot save dialogue.
-- macOS Automation and Accessibility permissions must already be granted.
on folderTextField(folderPanel)
    tell application "System Events"
        if exists text field 1 of folderPanel then return text field 1 of folderPanel
        if exists combo box 1 of folderPanel then
            if exists text field 1 of combo box 1 of folderPanel then return text field 1 of combo box 1 of folderPanel
        end if
    end tell
    return missing value
end folderTextField

on run arguments
    if (count of arguments) < 1 then error "Choose ready or capture mode."
    set actionName to item 1 of arguments
    if actionName is not "ready" and actionName is not "capture" then error "Unknown capture action."
    if actionName is "capture" and (count of arguments) is not 3 then error "Capture requires an output folder and PNG filename."
    tell application "System Events"
        set foundSimulator to false
        repeat 100 times
            set simulatorProcesses to application processes whose bundle identifier is "com.garmin.connectiq.simulator"
            if (count of simulatorProcesses) is 1 then
                set simulatorProcess to item 1 of simulatorProcesses
                set foundSimulator to true
                exit repeat
            end if
            delay 0.1
        end repeat
        if not foundSimulator then error "One Garmin simulator process was not available within ten seconds."
        if actionName is "ready" then return "Simulator process is ready."
        set outputFolder to item 2 of arguments
        set outputName to item 3 of arguments
        tell simulatorProcess
            set frontmost to true
            if not (exists menu bar item "File" of menu bar 1) then error "Garmin's File menu is unavailable."
            set fileMenu to menu 1 of menu bar item "File" of menu bar 1
            set captureItems to menu items of fileMenu whose name starts with "Save Screen Capture"
            if (count of captureItems) is 0 then set captureItems to menu items of fileMenu whose name starts with "Save Screenshot"
            if (count of captureItems) is 1 then
                set captureItem to item 1 of captureItems
            else
                error "Garmin's native screen capture menu item was not found."
            end if
            if not enabled of captureItem then error "Garmin's capture command is disabled; dismiss any existing simulator dialogue."
            click captureItem
            set foundPanel to false
            set saveAsSheet to false
            repeat 100 times
                if exists sheet 1 of front window then
                    set savePanel to sheet 1 of front window
                    if exists button "Save" of savePanel then
                        set foundPanel to true
                        set saveAsSheet to true
                        exit repeat
                    end if
                end if
                if exists button "Save" of front window then
                    set savePanel to front window
                    set foundPanel to true
                    exit repeat
                end if
                delay 0.1
            end repeat
            if not foundPanel then error "Garmin's screenshot save dialogue did not appear within ten seconds."
            keystroke "g" using {command down, shift down}
            set foundFolderPanel to false
            repeat 50 times
                if exists sheet 1 of savePanel then
                    set folderPanel to sheet 1 of savePanel
                    set folderField to my folderTextField(folderPanel)
                    if folderField is not missing value then
                        set foundFolderPanel to true
                        exit repeat
                    end if
                end if
                if not saveAsSheet then
                    if exists sheet 1 of front window then
                        set folderPanel to sheet 1 of front window
                        set folderField to my folderTextField(folderPanel)
                        if folderField is not missing value then
                            set foundFolderPanel to true
                            exit repeat
                        end if
                    end if
                end if
                delay 0.1
            end repeat
            if not foundFolderPanel then error "The screenshot output folder dialogue did not appear."
            set value of folderField to outputFolder
            keystroke return
            repeat 50 times
                if not (exists sheet 1 of savePanel) then exit repeat
                delay 0.1
            end repeat
            if exists sheet 1 of savePanel then error "The screenshot output folder could not be selected."
            if not (exists text field 1 of savePanel) then error "The screenshot filename field is unavailable."
            set value of text field 1 of savePanel to outputName
            click button "Save" of savePanel
            -- Never approve a replacement confirmation, even if another writer raced the capture.
            repeat 20 times
                if exists sheet 1 of front window then
                    set remainingPanel to sheet 1 of front window
                    if exists button "Replace" of remainingPanel then
                        if exists button "Cancel" of remainingPanel then click button "Cancel" of remainingPanel
                        error "A screenshot already exists at the requested path; replacement was refused."
                    end if
                end if
                delay 0.1
            end repeat
        end tell
    end tell
    return "Screenshot save requested."
end run
