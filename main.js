/**
 * Registers settings for the Nextcloud integration in the game. 
 * This includes settings for server URL, user credentials, and other preferences.
 */
function registerSettings() {
    game.settings.register('nextcloud-filepicker', 'url', {
        name: 'Nextcloud Server URL',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-filepicker', 'userName', {
        name: 'Nextcloud Account User Name',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-filepicker', 'appPassword', {
        name: 'Nextcloud Account App Password',
        scope: 'world',
        hint: 'Do not use your user password.  Creating an app password: Nextcloud Server Website -> Profile Picture -> Personal Settings -> Security -> Devices & Sessions -> "App name" -> Create new password',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-filepicker', 'subdirectory', {
        name: 'Nextcloud Subdirectory',
        scope: 'world',
        hint: 'Optional.  Use this field if you wish to only have access to a subdirectory within your Nextcloud storage.',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-filepicker', 'skipPublicLinkConfirmation', {
        name: 'Skip Public Link Confirmation',
        hint: 'If enabled, the public link creation confirmation dialog will be skipped.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
    });
    game.settings.register("nextcloud-filepicker", "nextcloudFilePaths", {
        name: "Nextcloud Filepaths",
        hint: "This setting is only for the purpose of preserving filepaths for navigation convenience",
        scope: "world", 
        config: false,
        type: Object,
        default: {}
    });
}
/**
 * Extends the FilePicker to integrate with Nextcloud, allowing file browsing and operations within Nextcloud storage.
 */
class NextcloudFilePicker extends FilePicker {
    static thumbnailCache = {};
    /**
     * Constructs an instance of NextcloudFilePicker with specified options.
     * Initializes the file sources for Nextcloud and sets the active source if the URL matches Nextcloud.
     * @param {Object} options - Configuration options for the FilePicker.
     */
    constructor(options = {}) {
        super(options);
        this.sources.nextcloud = {
            target: "",
            label: "Nextcloud Data",
            icon: "fas fa-cloud"
        }
        if(this.isNextcloudUrl(this.request)) {
            const source="nextcloud"
            let nextcloudFilePaths = getSetting("nextcloudFilePaths");
            const target = nextcloudFilePaths[this.request] || "";
            this.activeSource = source;
            this.sources[source].target = target;
        }
    }
    /**
     * Defines the default options for the Nextcloud File Picker.
     * @returns {Object} The default configuration options for the file picker.
     */
    static get defaultOptions() {
        const baseOptions = super.defaultOptions;
        return mergeObject(baseOptions, {
            tabs: [{navSelector: ".tabs", contentSelector: ".content", initial: "nextcloud"}]
        });
    }
    /**
     * Clears the existing content in the FilePicker UI. 
     * This is used to refresh the UI and remove any previously displayed files/directories.
     */
    clearFilePickerContent() {
        const content = this.element.find('.filepicker-body');
        content.empty();
    }
    /**
     * Handles errors encountered during operations with Nextcloud.
     * It determines the type of error and renders the appropriate UI to inform the user.
     * @param {Error} error - The error object thrown during Nextcloud operations.
     */
    handleNextcloudError(error) {
        console.error('Error fetching Nextcloud files:', error);
        if (!getSetting('url')) {
            this._renderNextcloudErrorUI('urlNotSet');
        } else if (!getSetting('userName') || !getSetting('appPassword')) {
            this._renderNextcloudErrorUI('credentialsNotSet');
        } else if (this._isCorsError(error)) {
            this._renderNextcloudErrorUI('corsError');
        } else {
            this._renderNextcloudErrorUI('connectionError');
        }
    }
    /**
     * Fetches files from the specified path in Nextcloud using WebDAV API.
     * @param {string} path - The path within the Nextcloud instance to fetch files from.
     * @returns {Promise<Object>} A promise that resolves to the data of the fetched files.
     */
    async _fetchNextcloudFiles(path) {
        const endpoint = `remote.php/dav/files/${getSetting('userName')}/${getSetting('subdirectory')}/${path}`;
        this.showSpinner();
        const xmlResponse = await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'PROPFIND', null, {}, {});
        this.hideSpinner();
        const data = this._parseWebDavResponse(xmlResponse);
        data.path = path;
        return data;
    }
    /**
     * Fetches the unique file ID for a given file name in Nextcloud.
     * @param {string} fileName - The name of the file to find the ID for.
     * @returns {Promise<string|null>} A promise resolving to the file ID, or null if not found.
     */
    async fetchFileId(fileName) {
        const searchXml = `<?xml version="1.0"?>
        <d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
            <d:basicsearch>
                <d:select>
                    <d:prop>
                        <oc:fileid/>
                    </d:prop>
                </d:select>
                <d:from>
                    <d:scope>
                        <d:href>/files/${getSetting('userName')}</d:href>
                        <d:depth>infinity</d:depth>
                    </d:scope>
                </d:from>
                <d:where>
                    <d:like>
                        <d:prop>
                            <d:displayname/>
                        </d:prop>
                        <d:literal>%${fileName}%</d:literal>
                    </d:like>
                </d:where>
            </d:basicsearch>
        </d:searchrequest>`;
        const endpoint = `remote.php/dav/`;
        try {
            this.showSpinner();
            const xmlResponse = await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'SEARCH', searchXml, { 'Content-Type': 'text/xml' });
            this.hideSpinner();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlResponse, "application/xml");
            const fileidElements = xmlDoc.querySelectorAll("oc\\:fileid, fileid");
            let fileId = null;
            if (fileidElements.length > 0) {
                fileId = fileidElements[0].textContent;
            }
            return fileId;
        } catch (error) {
            console.error('Error fetching file ID:', error);
            throw error;
        }
    }
    /**
     * Fetches an image from Nextcloud and converts it to a Base64 encoded string.
     * @param {string} fileName - The name of the image file to fetch.
     * @param {number} s - Size parameter for the image to fetch.
     * @returns {Promise<string>} A promise that resolves to the Base64 encoded image data.
     */
    async fetchImageAsBase64(fileName, s) {
        try {
            const fileId = await this.fetchFileId(fileName);
            const previewEndpoint = `index.php/apps/webapppassword/core/preview?fileId=${fileId}&x=${s}&y=${s}`;
            const imageBlob = await NextcloudFilePicker.makeNextcloudApiRequest(previewEndpoint, 'GET', null, {}, { responseType: 'blob' });
            return convertBlobToBase64(imageBlob);
        } catch (error) {
            console.error('Error fetching image as Base64:', error);
            throw error;
        }
    }
    /**
     * Renders the UI to display Nextcloud error messages based on the type of error encountered.
     * @param {string} errorType - The type of error to render the UI for (e.g., 'urlNotSet', 'corsError').
     */
    async _renderNextcloudErrorUI(errorType) {
        let errorMessage = "";
        let isCorsError = false;
        let isUrlNotSet = false;
        let isCredentialsNotSet = false;
        let isOtherError = false;
        switch (errorType) {
            case 'urlNotSet':
                isUrlNotSet = true;
                break;
            case 'credentialsNotSet':
                isCredentialsNotSet = true;
                break;
            case 'corsError':
                isCorsError = true;
                break;
            case 'connectionError':
                isOtherError = true;
                break;
        }
        const templateData = { isCorsError, isUrlNotSet, isCredentialsNotSet, isOtherError };
        const renderedHtml = await renderTemplate('modules/nextcloud-filepicker/templates/nextcloud-error.html', templateData);
        const content = this.element.find('.filepicker-body');
        this.element.find('nav.tabs[aria-role="Form Tab Navigation"]').nextAll().remove();
        this.element.find('section.filepicker-body').nextAll().remove();
        content.html(renderedHtml);
    }
    /**
     * Checks whether file upload is allowed to Nextcloud based on current settings and user permissions.
     * @returns {boolean} True if upload is allowed, false otherwise.
     */
    get canUpload() {
        if ( this.activeSource === 'nextcloud' ) {
            if ( this.type === "folder" ) return false;
            if ( this.options.allowUpload === false ) return false;
            return !game.user || game.user.can("FILES_UPLOAD");
        } else {
            return super.canUpload;
        }
      }
    /**
     * Renders the UI specifically for CORS (Cross-Origin Resource Sharing) errors encountered with Nextcloud.
     */
    async _renderCorsErrorUI() {
        const html = await renderTemplate("modules/nextcloud-filepicker/templates/cors-error.html");
        const content = this.element.find('.filepicker-body');
        this.element.find('nav.tabs[aria-role="Form Tab Navigation"]').nextAll().remove();
        this.element.find('section.filepicker-body').nextAll().remove();
        content.html(html);
    }
    /**
     * Determines if a given error is related to CORS issues.
     * @param {Error} error - The error object to evaluate.
     * @returns {boolean} True if the error is a CORS error, false otherwise.
     */
    _isCorsError(error) {
        return error.message.includes('CORS') || error.message.includes('NetworkError');
    }
    /**
     * Makes an API request to the Nextcloud server.
     * @param {NextcloudFilePicker} nextcloudFilePicker - The instance of the NextcloudFilePicker making the request.
     * @param {string} endpoint - The API endpoint relative to the Nextcloud base URL.
     * @param {string} [method='GET'] - The HTTP method to use for the request.
     * @param {Object|null} [data=null] - The data to send with the request.
     * @param {Object} [headers={}] - Additional headers for the request.
     * @param {Object} [options={}] - Additional options for the request.
     * @param {boolean} [shouldWait=false] - Whether to show a loading spinner during the request.
     * @returns {Promise} A promise that resolves to the response from the API request.
     */
    static async makeNextcloudApiRequest(endpoint, method = 'GET', data = null, headers = {}, options = {}) {
        const baseUrl = getSetting('url');
        const userName = getSetting('userName');
        const appPassword = getSetting('appPassword');
        const url = `${baseUrl}/${endpoint}`;
        const authHeader = 'Basic ' + btoa(userName + ':' + appPassword);
        const defaultHeaders = {
            'Authorization': authHeader,
            'OCS-APIRequest': true
        };
        const combinedHeaders = { ...defaultHeaders, ...headers };
        const requestOptions = {
            method: method,
            headers: combinedHeaders,
            credentials: 'omit'
        };
        if (method === 'PUT') {
            requestOptions.body = data;
        }
        if (method === 'SEARCH') {
            requestOptions.body = data;
        }
        if (method === 'POST' && data !== null) {
            const formData = new URLSearchParams();
            for (const key in data) {
                formData.append(key, data[key]);
            }
            requestOptions.body = formData;
        }
        try {
            const response = await fetch(url, requestOptions);
            if (!response.ok) {
                throw new Error(`Network response was not ok (${response.status}): ${response.statusText}`);
            }
            if (options.responseType === 'blob') {
                return await response.blob();
            } else if (response.headers.get('Content-Type').includes('application/json')) {
                return await response.json();
            } else if (response.headers.get('Content-Type').includes('application/xml') || response.headers.get('Content-Type').includes('text/xml')) {
                return await response.text();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('Error making API request:', error);
            throw error;
        } 
    }
    /**
     * Displays a loading spinner in the file picker UI during processing or API requests.
     * @param {NextcloudFilePicker} nextcloudFilePicker - The instance of the NextcloudFilePicker.
     */
    showSpinner() {
        const html = this.element;
        const filePickerElement = html.find(".standard-form");
        filePickerElement.css("filter", "blur(1px) brightness(0.75) contrast(0.75)");
        const spinnerHtml = `<div class='spinner-overlay' style="width: 100%;height: 100%;position: absolute;z-index: 10;text-align: center;line-height: 100%;vertical-align: middle;display: flex;align-items: center;">
        <i class="fa-solid fa-spinner-third fa-2xl" style="color: black;width: 100%; animation: fa-spin 0.5s infinite linear; font-size: 64px;"></i>
        </div>`;
        filePickerElement.parent().prepend(spinnerHtml);
    }
    /**
     * Hides the loading spinner in the file picker UI after processing or API requests are complete.
     * @param {NextcloudFilePicker} nextcloudFilePicker - The instance of the NextcloudFilePicker.
     */
    hideSpinner() {
        const html = this.element;
        const filePickerElement = html.find(".standard-form");
        filePickerElement.css("filter", "");
        filePickerElement.parent().find('.spinner-overlay').remove();
    }
    /**
     * Checks if a file or directory in Nextcloud has an existing public link.
     * @param {string} path - The path of the file or directory to check.
     * @returns {Promise<boolean|string[]|null>} A promise that resolves to the public link URL if it exists, a list of files if a directory, or null otherwise.
     */
    async checkPublicLink(path) {
        let isFile = true;
        if(path.slice(-1) == "/") {
            isFile = false
            path=path.substring(0,-1);
        }
        let filePath = encodeURIComponent(path)
        if(getSetting('subdirectory')) {
            filePath = `${getSetting('subdirectory')}/${filePath}`;
        }
        const endpoint = `/index.php/apps/webapppassword/api/v1/shares?path=${filePath}&reshares=true&subfiles=false`;
        try {
            const response = await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'GET');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, "application/xml");
            if ( isFile ) {
                const urlElement = xmlDoc.querySelector("url");
                if (urlElement) {
                    let fileName = encodeURIComponent(filePath.split('/').pop());
                    const url = urlElement.textContent;
                                        return url + `/download/${fileName}`;
                } else {
                    return null;
                }
            }
            else {
                const urlElements = xmlDoc.querySelectorAll("element");
                return Array.from(urlElements).map((a) => {
                    if ((a.querySelector("mimetype").textContent != 'httpd/unix-directory')) {
                        const file = a.querySelector("file_target").textContent.replace("/", "");
                        const path = a.querySelector("path").textContent.replace(file, "").replace(/\/$/,"").replace(/^\//,"");
                        const url = a.querySelector("url").textContent;
                        if (path == this.target) {
                            return file
                        }
                    }
                }).filter((e) => { return e != undefined});
            }
        } catch (error) {
            console.error('Error checking public link:', error);
            return false;
        }
    }
    /**
     * Creates a public link for a file in Nextcloud if it doesn't already exist.
     * @param {string} file - The path of the file to create a public link for.
     * @returns {Promise<string|null>} A promise that resolves to the public link URL or null if unable to create.
     */
    async createPublicLink(file) {
        let fileName= encodeURIComponent(file.split('/').pop());
        let filePath=file;
        if(getSetting('subdirectory')) filePath = `${getSetting('subdirectory')}/${filePath}`
        const endpoint = `/index.php/apps/webapppassword/api/v1/shares`;
        const body = {
            path: filePath,
            shareType: 3,
            permissions: 1
        };
        this.showSpinner();
        const response = await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'POST', body, {}, {});
        this.hideSpinner();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response, "application/xml");
        const urlElement = xmlDoc.querySelector("url");
        if (urlElement) {
            const url = urlElement.textContent;
                        return url + `/download/${fileName}`;
        } else {
            return null;
        }
    }
    /**
     * Updates the file picker UI with icons indicating which files have public links.
     */
    async updatePublicLinkIcons() {
        const targetDirectory = this.source.target;
        const filesWithLinks = await this.checkPublicLink(targetDirectory + "/");
        if ( filesWithLinks ) {
            this.element.find('.file').each($.proxy(function (index, element) {
                const fileName = $(element).data('name');
                if (filesWithLinks.includes(fileName) && !$(element).find('.fa-link').length) {
                    let innerHTML = '';
                    switch (this.displayMode) {
                        case "list": 
                            $(element).append('<i style="color: #0082C9;" class="fas fa-link fa-solid fa-sm"></i>');
                            break;
                        case "thumbs":
                            innerHTML = $(element).find('.filename').html();
                            $(element).find('.filename').html(innerHTML + '<i style="color: #0082C9; margin-left:4px;" class="fas fa-link fa-solid fa-sm"></i>');
                            break;
                        case "tiles":
                            $(element).append('<i style="color: #0082C9;top: -34px;position: relative;font-size: 20px;left: 72px;" class="fas fa-link fa-solid fa-sm"></i>');
                            break;
                        case "images":
                            innerHTML = $(element).find('.filename').html();
                            $(element).find('.filename').html(innerHTML + '<i style="color: #0082C9; margin-left:4px;" class="fas fa-link fa-solid fa-sm"></i>');
                            break;
                        default:
                            break;
                    }
                }
            }, this));
        }
    }
    /**
     * Handles the submit event of the file picker. This includes creating public links for selected Nextcloud files if necessary.
     * @param {Event} ev - The submit event object.
     */
    async _onSubmit(ev) {
        ev.preventDefault();
        let path = ev.target.file.value;
        if (!path) return ui.notifications.error("You must select a file to proceed.");
        if (this.activeSource === "nextcloud") {
            const publicLink = await this.checkPublicLink(path);
            if (!publicLink) {
                const proceed = await this.showConfirmationDialog();
                if (proceed) {
                    try {
                        const target = await this.createPublicLink(path);
                        ui.notifications.info("A public link has been created for the file.");
                        path = target;
                        handleFileSelection(ev.target.file.value, path);
                    } catch (error) {
                        console.error('Error creating public link:', error);
                        ui.notifications.error("Failed to create a public link for the file.");
                        return;
                    }
                } else {
                    return;
                }
            }
            else {
                path = publicLink;
                handleFileSelection(ev.target.file.value, path);
            }
        }
        if (this.field) {
            this.field.value = path;
            this.field.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (this.callback) this.callback(path, this);
        return this.close();
    }
    /**
     * Displays a confirmation dialog when creating a public link for a file.
     * @returns {Promise<boolean>} A promise that resolves to true if the user confirms, false otherwise.
     */
    async showConfirmationDialog() {
        if (game.settings.get('nextcloud-filepicker', 'skipPublicLinkConfirmation')) {
            return true;
        }
        return new Promise(resolve => {
            let content = `
                <p>In order for other players to view this image, a public link will need to be created. Do you wish to proceed?</p>
                <div><input type="checkbox" id="skipConfirmation" name="skipConfirmation"><label for="skipConfirmation">Do not ask again</label></div>
            `;
            let d = new Dialog({
                title: "Create Public Link",
                content: content,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Yes",
                        callback: (html) => {
                            const skipConfirmation = html.find('#skipConfirmation').is(':checked');
                            setSetting('skipPublicLinkConfirmation', skipConfirmation);
                            resolve(true);
                        }
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "No",
                        callback: () => resolve(false)
                    }
                },
                default: "no",
                close: () => resolve(false)
            });
            d.render(true);
        });
    }
    /**
     * Handles the upload of files to Nextcloud.
     * @param {string} source - The source from which the file is being uploaded.
     * @param {string} path - The path where the file will be uploaded.
     * @param {File} file - The file to be uploaded.
     * @param {Object} [body={}] - Additional body parameters for the upload request.
     * @param {Object} [options={}] - Additional options for the upload request.
     * @returns {Promise<Object>} A promise that resolves with upload response details.
     */
    static async upload(source, path, file, body={}, options={}) {
        if (source === "nextcloud") {
            const endpoint = `remote.php/dav/files/${getSetting('userName')}/${getSetting('subdirectory')}/${path}/${file.name}`;
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const arrayBuffer = reader.result;
                        await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'PUT', arrayBuffer, {}, {});
                        resolve({ path: endpoint });
                    } catch (error) {
                        console.error('Error uploading to Nextcloud:', error);
                        reject(error);
                    }
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsArrayBuffer(file);
            });
        } else {
            return super.upload(source, path, file, body, options);
        }
    }
    /**
     * Presents a dialog to create a new directory in the Nextcloud storage.
     * @param {Object} source - The data source being browsed.
     * @private
     */
    _createDirectoryDialog(source) {
        if (this.activeSource === "nextcloud") {
            const form = `<form><div class="form-group">
            <label>Directory Name</label>
            <input type="text" name="dirname" placeholder="directory-name" required/>
            </div></form>`;
            return Dialog.confirm({
            title: game.i18n.localize("FILES.CreateSubfolder"),
            content: form,
            yes: async html => {
                const dirname = html.querySelector("input").value;
                const path = [source.target, dirname].filterJoin("/");
                try {
                await this.constructor.createDirectory(this.activeSource, path, {nextcloudFilePicker: this});
                } catch ( err ) {
                ui.notifications.error(err.message);
                }
                return this.browse(this.target);
            },
            options: {jQuery: false}
            });
            }
        else {
            return super._createDirectoryDialog(source);
        }
    }
    /**
     * Creates a new directory in the Nextcloud storage.
     * @param {string} source - The source in which the directory is being created.
     * @param {string} target - The target path for the new directory.
     * @param {Object} [options={}] - Additional options for the directory creation.
     * @returns {Promise<boolean>} A promise that resolves to true if the directory is successfully created, false otherwise.
     */
    static async createDirectory(source, target, options = {}) {
        if (source === "nextcloud") {
            let fullPath = target;
            const endpoint = `remote.php/dav/files/${getSetting('userName')}/${getSetting('subdirectory')}/${fullPath}`;
            try {
                await NextcloudFilePicker.makeNextcloudApiRequest(endpoint, 'MKCOL', null, {}, {});
                ui.notifications.info(`Directory created: ${fullPath}`);
                return true;
            } catch (error) {
                console.error('Error creating directory:', error);
                ui.notifications.error(`Failed to create directory: ${fullPath}`);
                return false;
            }
        } else {
            return super.createDirectory(source, target, options);
        }
    }
     /**
     * Browses the target directory in Nextcloud and updates the file picker UI with the results.
     * @param {string} [target=""] - The target directory to browse.
     * @param {Object} [options={}] - Additional browsing options.
     * @returns {Promise<Object>} A promise that resolves to the browsing result data.
     */
     async browse(target = "", options = {}) {
        if (this.activeSource === "nextcloud") {
            const data = await this._fetchNextcloudFiles(target);
            const convertedData = this._convertToBrowseResults(data);
            let filteredFiles = convertedData.files;
            if (this.type !== "any" && this.extensions.length) {
                filteredFiles = convertedData.files.filter(file => {
                    return this.extensions.some(ext => file.name.toLowerCase().endsWith(ext));
                });
            }
            this.result = {
                target: target,
                private: false,
                gridSize: null,
                dirs: convertedData.dirs.map(dir => {
                    let dirName = dir.path;
                    return dirName;
                }),
                privateDirs: [],
                files: filteredFiles.map(file => file.url),
                extensions: this.extensions || []
            };
            this.constructor.LAST_BROWSED_DIRECTORY = this.result.target;
            this._loaded = true;
            try {
                this.source.target = target;
                this.render(true);
                return this.result;
            }
            catch (error){
            }
        } else {
            const super_result=super.browse(target, options);
            return super_result;
        }
    }
    /**
     * Retrieves data for the file picker UI, including files and directories from the Nextcloud source.
     * @param {Object} [options={}] - Options for retrieving data.
     * @returns {Promise<Object>} A promise that resolves to the data needed for rendering the file picker UI.
     */
    async getData(options = {}) {
        let data = await super.getData(options);
        if (this.activeSource === "nextcloud") {
            const result = this.result;
            const source = this.source;
            let target = decodeURIComponent(source.target);
            const isS3 = false;
            let dirs = result.dirs.map(d => ({
                name: decodeURIComponent(d.split("/").pop()),
                path: d,
                private: result.private || result.privateDirs.includes(d)
              }));
              dirs = dirs.sort((a, b) => a.name.localeCompare(b.name));
              let files = result.files.map(f => {
                let img = ""; 
                if ( VideoHelper.hasVideoExtension(f) ) img = "icons/svg/video.svg";
                else if ( AudioHelper.hasAudioExtension(f) ) img = "icons/svg/sound.svg";
                else if ( !ImageHelper.hasImageExtension(f) ) img = "icons/svg/book.svg";
                else {
                    img = NextcloudFilePicker.thumbnailCache[f] || img;
                }
                return {
                  name: decodeURIComponent(f.split("/").pop()),
                  url: f,
                  img: img
                };
              });
            if (["thumbs", "tiles", "images"].includes(this.displayMode)) {
                files.forEach((file, index) => {
                    if (ImageHelper.hasImageExtension(file.name) && !NextcloudFilePicker.thumbnailCache[file.url]) {
                        this.fetchImageAsBase64(file.name, 200).then(base64Image => {
                            NextcloudFilePicker.thumbnailCache[file.url] = base64Image;
                            files[index].img = base64Image;
                            this.updateImageInDOM(file.name, base64Image);
                        });
                    }
                });    
            }
            data =  {
                bucket: isS3 ? source.bucket : null,
                canGoBack: this.activeSource !== "",
                canUpload: this.canUpload,
                canSelect: !this.options.tileSize,
                cssClass: [this.displayMode, result.private ? "private": "public"].join(" "),
                dirs: dirs,
                displayMode: this.displayMode,
                extensions: this.extensions,
                files: files,
                isS3: isS3,
                noResults: dirs.length + files.length === 0,
                selected: this.type === "folder" ? target : this.request,
                source: source,
                sources: this.sources,
                target: target,
                tileSize: this.options.tileSize ? (FilePicker.LAST_TILE_SIZE || canvas.dimensions.size) : null,
                user: game.user,
                submitText: this.type === "folder" ? "FILES.SelectFolder" : "FILES.SelectFile",
                favorites: FilePicker.favorites
            };
        } 
        if (data.selected && this.isNextcloudUrl(data.selected)) {
            
            let nextcloudFilePaths = getSetting("nextcloudFilePaths");
            const relativePath = nextcloudFilePaths[data.selected];
            if (relativePath) {
                data.selected = relativePath;
            } else {
                data.selected = this.extractFileName(data.selected)
            }
        }
        return data;
    }
    /**
     * Checks if a given path is a Nextcloud URL.
     * @param {string} path - The path or URL to check.
     * @returns {boolean} True if it's a Nextcloud URL, false otherwise.
     */
    isNextcloudUrl(path) {
        return path.includes(getSetting('url'));
    }
    /**
     * Extracts the filename from a full URL or path.
     * @param {string} path - The full URL or path to the file.
     * @returns {string} The extracted filename.
     */
    extractFileName(path) {
        return decodeURIComponent(path.split('/').pop().split('?')[0]);
    }
    /**
     * Updates the image source in the DOM for a given file name with the provided Base64 image data.
     * @param {string} fileName - The name of the file for which to update the image.
     * @param {string} base64Image - The Base64 encoded image data.
     */
    updateImageInDOM(fileName, base64Image) {
        const fileElements = this.element.find(`.file[data-name="${fileName}"]`);
        fileElements.each(function() {
            const imgElement = $(this).find('img');
            if (imgElement.length) {
                imgElement.attr('src', base64Image);
            }
        });
    }
    /**
     * Navigates back to the parent directory in the Nextcloud file picker UI.
     */
    goBack() {
        if (this.activeSource === "nextcloud") {
            let parts = this.sources.nextcloud.target.split('/').filter(Boolean);
            parts.pop();
            let parentPath = parts.join('/') || '';
            this.browse(parentPath);
        }
    }
    /**
     * Converts Nextcloud XML data to a format compatible with FilePicker results.
     * @param {Object} nextcloudData - The Nextcloud data to convert.
     * @returns {Object} Formatted results with 'files' and 'dirs' arrays.
     */
    _convertToBrowseResults(nextcloudData) {
        let dirs = [], files = [];
        for (let dir of nextcloudData.directories) {       
            if (dir.href !== nextcloudData.path) {
                dirs.push({
                    name: decodeURIComponent(dir.name),
                    path: decodeURIComponent(dir.href),
                    private: false
                });
            }
        }
        for (let file of nextcloudData.files) {
            let thumbnail = file.thumbnail || (f => {
                if (VideoHelper.hasVideoExtension(f)) return "icons/svg/video.svg";
                else if (AudioHelper.hasAudioExtension(f)) return "icons/svg/sound.svg";
                else if (!ImageHelper.hasImageExtension(f)) return "icons/svg/book.svg";
            })(file.name);
            files.push({
                name: decodeURIComponent(file.name),
                path: decodeURIComponent(file.href),
                url: decodeURIComponent(file.href),
                img: thumbnail,
            });
        }
        return { dirs, files };
    }
    removeDavRootDir(dirHref) {
                const removalString=`/remote.php/dav/files/${getSetting('userName')}/${getSetting('subdirectory')}/`
        const newHref=dirHref.substring(removalString.length-1,dirHref.length);
        return newHref;
    }
    /**
     * Parses the XML response from the Nextcloud WebDAV API to extract file and directory information.
     * @param {string} xml - The XML response as a string.
     * @returns {Object} An object containing arrays of files and directories extracted from the response.
    */
    _parseWebDavResponse(xml) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "application/xml");
        const files = [];
        const directories = [];
        const responses = xmlDoc.querySelectorAll("d\\:response, response");
        responses.forEach(response => {
            const href = this.removeDavRootDir(response.querySelector("d\\:href, href").textContent.replace(/\/$/,''));
            const resType = response.querySelector("d\\:resourcetype, resourcetype");
            const isDirectory = resType.querySelector("d\\:collection, collection") !== null;
            const name = decodeURIComponent(href.split("/").pop());
            if (isDirectory) {
                directories.push({ name, href });
            } else {
                files.push({ name, href });
            }
        });
        return { files, directories };
    }
    /**
     * Initializes and opens the FilePicker from a button click, handling any necessary setup.
     * @param {HTMLElement} button - The button element that triggered the FilePicker.
     * @returns {FilePicker} The instance of the FilePicker initialized from the button.
     */
    static fromButton(button) {
        let type = button.getAttribute("data-type");
        const form = button.form;
        const field = form[button.dataset.target] || null;
        let current = field?.value || "";
        if (isNextcloudUrl(current)) {
            current = this.extractFileName(current);
        }
        return new FilePicker({ field, type, current, button });
    }
    /**
     * Renders the FilePicker interface, updating the UI based on the current state and source.
     * @param {boolean} [force=false] - Whether to force the rendering of the FilePicker.
     * @param {Object} [options={}] - Options for rendering the FilePicker.
     */
    async render(force = false, options = {}) {
        super.render(force, options);
        setTimeout(() => {
            if (this.activeSource === "nextcloud") {
                this.updatePublicLinkIcons();                
            }
        }, 0);
    }
}
/**
 * Retrieves the value of a specified setting for the Nextcloud integration.
 * @param {string} setting - The key name of the setting to retrieve.
 * @returns {*} The value of the requested setting.
 */
function getSetting(setting) {
    return game.settings.get('nextcloud-filepicker', setting);
}

function setSetting(setting, value) {
    return game.settings.set('nextcloud-filepicker', setting, value);
}
/**
 * Initializes the module, sets up Nextcloud integration settings, and configures the NextcloudFilePicker.
 */
function initializeModule() {
    registerSettings();
    try {
    } catch (error) {
        console.error(`Error initializing ${MODULE_NAME}:`, error);
    }
}
/**
 * Handles the selection of a file, updating the Nextcloud file paths setting accordingly.
 * @param {string} filePath - The selected file path.
 * @param {string} nextcloudUrl - The Nextcloud URL associated with the file.
 */
function handleFileSelection(filePath, nextcloudUrl) {
    let nextcloudFilePaths = getSetting("nextcloudFilePaths");
    nextcloudFilePaths[nextcloudUrl] = filePath;
    setSetting("nextcloudFilePaths", nextcloudFilePaths);
}
/**
 * Logs a message for the module with a specified level of importance.
 * @param {string} level - The log level ('debug', 'info', 'error').
 * @param {string} message - The message to log.
 * @param {string} [context='General'] - Context or category of the message.
 * @param {Error} [error=null] - Optional error object for detailed logging.
 */
function logMessage(level, message, context = 'General', error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `Nextcloud Foundry | ${context} - ${message}`;
    switch (level) {
        case 'debug':
            console.debug(logMessage);
            break;
        case 'info':
            console.info(logMessage);
            break;
        case 'error':
            console.error(logMessage, error);
            let userFriendlyMessage = `An error occurred in ${context}. Please check the console for more details.`;
            break;
        default:
    }
}
/**
 * Resizes an image blob to a specific maximum size. It maintains the aspect ratio of the image and uses the HTML canvas for resizing.
 * The function creates an Image from the blob, then draws it onto a canvas with the new size, and finally converts the canvas back to a blob.
 * @param {Blob} blob - The image blob to be resized.
 * @param {number} maxSize - The maximum width or height of the image. The image will be scaled to maintain aspect ratio.
 * @returns {Promise<Blob>} A promise that resolves with the resized image as a Blob object.
 */
async function resizeImage(blob, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            const aspectRatio = width / height;
            if (width > height && width > maxSize) {
                width = maxSize;
                height = Math.round(width / aspectRatio);
            } else if (height > maxSize) {
                height = maxSize;
                width = Math.round(height * aspectRatio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, 'image/png');
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}
/**
 * Converts a Blob object to a Base64 encoded string.
 * @param {Blob} blob - The Blob object to be converted.
 * @returns {Promise<string>} A promise that resolves to the Base64 encoded string.
 */
function convertBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
/**
 * Constructs a full WebDAV URL for a given relative path using the Nextcloud base URL from settings.
 * @param {string} relativePath - The relative path to append to the Nextcloud base URL.
 * @returns {string} The full WebDAV URL.
 */
function constructWebDavUrl(relativePath) {
    const baseUrl = game.settings.get('nextcloud-filepicker', 'url');
    return `${baseUrl}/${relativePath}`;
}
/**
 * Initialization code to set up the module. Registers the Nextcloud settings and integrates the NextcloudFilePicker.
 */
Hooks.once("init", () => {
    if(!game.data.files.storages.includes("nextcloud")) {
        game.data.files.storages.push("nextcloud");
    }
    registerSettings();
    FilePicker = NextcloudFilePicker;
});
