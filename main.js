
function registerSettings() {
    game.settings.register('nextcloud-foundry', 'url', {
        name: 'Nextcloud Server URL',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-foundry', 'userName', {
        name: 'Nextcloud Account User Name',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });
    game.settings.register('nextcloud-foundry', 'password', {
        name: 'Nextcloud Account Password',
        scope: 'world',
        config: true,
        type: String,
        default: ''
    });
}

/* UI */
function setupNextcloudTabListener() {
    const nextcloudTab = document.getElementById('nextcloudTab');
    if (nextcloudTab) {
        nextcloudTab.addEventListener('click', () => {
            populateFileList('root');
        });
    }
}

function injectNextcloudTab() {
    const tabs = document.querySelector('.filepicker-header .tabs');
    if (tabs && !document.getElementById('nextcloudTab')) {
        // Create the Nextcloud tab
        const nextcloudTab = document.createElement('a');
        nextcloudTab.className = 'item';
        nextcloudTab.id = 'nextcloudTab';
        nextcloudTab.setAttribute('data-tab', 'nextcloud');
        nextcloudTab.innerHTML = '<i class="fas fa-cloud"></i> Nextcloud';

        // Append the Nextcloud tab to the navigation bar
        tabs.appendChild(nextcloudTab);

        // Setup listener for the Nextcloud tab
        setupNextcloudTabListener();
    }
}


// Function to fetch file structure from Nextcloud
async function fetchNextcloudFiles(directoryPath) {
    // TODO: Replace this with the actual API call to your Nextcloud backend
    // This should return a list of files and folders in the specified directory
    try {
        // Assuming getDirectoryStructure is your function to fetch the directory structure
        return await getDirectoryStructure(directoryPath); 
    } catch (error) {
        console.error('Error fetching files from Nextcloud:', error);
        // Handle error - maybe show a user-friendly message or log
        return []; // Return an empty array in case of error
    }
}

// Function to populate the file list based on the current directory
async function populateFileList(currentDirectory) {
    const filesAndFolders = await fetchNextcloudFiles(currentDirectory);

    const fileList = document.getElementById('fileList');
    fileList.innerHTML = ''; // Clear current list

    // Optionally add a 'back' item if not in the root directory
    if (currentDirectory !== 'root') {
        fileList.appendChild(createListItem('..', 'back'));
    }

    // Add files and folders to the list
    filesAndFolders.forEach(item => {
        // Assuming each item has 'name' and 'type' ('file' or 'folder')
        fileList.appendChild(createListItem(item.name, item.type)); 
    });
}


// Function to create an HTML element for a file or folder
function createListItem(name, type) {
    const item = document.createElement('div');
    item.classList.add(type === 'file' ? 'fileItem' : 'folderItem');
    item.innerHTML = `<i class="fas fa-${type === 'file' ? 'file' : 'folder'} fa-fw"></i> ${name}`;
    item.onclick = () => onListItemClick(name, type);
    return item;
}

// Event handler for list item click
function onListItemClick(name, type) {
    // TODO: Implement what happens when a file/folder is clicked
    // For folders, this should navigate into the folder
    // For files, this should update the current selection display
    console.log(`Clicked on ${type}: ${name}`);
}

// Function to handle the "Select File" button click
document.getElementById('selectFileButton').onclick = () => {
    // TODO: Implement the logic to handle the file selection
    // This should involve checking/creating a public link for the selected file
    console.log('Select File button clicked');
};

// Initial call to populate the root directory
populateFileList('root');

/* END UI */

/**
 * Retrieves a specified setting value from FoundryVTT's game settings.
 * @param {string} setting - The key for the setting to retrieve.
 * @returns {string} The value of the specified setting.
 */
function getSetting(setting) {
    return game.settings.get('nextcloud-foundry', setting);
}

/**
 * Makes an API request to Nextcloud.
 * @param {string} path - The API endpoint path.
 * @param {string} method - HTTP method (e.g., 'GET', 'POST').
 * @returns {Promise} - Promise that resolves to the response of the request.
 */
async function makeNextcloudApiRequest(path, method = 'GET') {
    const baseUrl = getSetting('url');
    const userName = getSetting('userName');
    const password = getSetting('password');
    const url = `${baseUrl}/${path}`;

    // Base64 encode the username and password for basic authentication
    const authHeader = 'Basic ' + btoa(userName + ':' + password);

    const options = {
        method: method,
        headers: {
            'Authorization': authHeader
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`Network response was not ok (${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error making API request:', error);
        throw error; // Rethrow the error for handling by the caller
    }
}



/**
 * Retrieves the structure of a specified directory from Nextcloud.
 * @param {string} directoryPath - Path to the directory.
 * @returns {Promise<Object>} Directory structure.
 * Order of Development: 6
 */
async function getDirectoryStructure(directoryPath) {
    try {
        const directoryData = await makeNextcloudApiRequest(directoryPath);
        // Further process directoryData as needed to fit the desired structure
        return directoryData;
    } catch (error) {
        console.error('Error getting directory structure:', error);
        // Handle or rethrow error as appropriate for your application
    }
}

/**
 * Retrieves the file details from Nextcloud.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<Object>} File details.
 * Order of Development: 7
 */
async function getFileStructure(filePath) {
    // Encode the filePath to handle special characters in a URL
    const encodedFilePath = encodeURIComponent(filePath);
    // WebDAV requires using the full path to the file, so we construct the DAV URL
    const davPath = `remote.php/dav/files/${getSetting('userName')}/${encodedFilePath}`;

    try {
        const fileData = await makeNextcloudApiRequest(davPath, 'PROPFIND');
        
        // Note: Replace 'displayname', 'size', 'contenttype', and 'lastmodified' 
        // with actual property names provided by your Nextcloud WebDAV response.
        const fileStructure = {
            name: fileData['displayname'],
            size: fileData['size'],
            type: fileData['contenttype'],
            lastModified: fileData['lastmodified']
        };
        return fileStructure;
    } catch (error) {
        console.error('Error retrieving file details:', error);
        // Call a function to handle and display this error to the user
        displayUserError(`Failed to retrieve file details for "${filePath}": ${error.message}`);
        // Depending on your error handling strategy, you may throw the error or return null/false
        throw error;
    }
}

/**
 * Checks if a file has an existing public link.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<boolean>} True if public link exists, false otherwise.
 */
async function checkPublicLink(filePath) {
    // Encode the filePath to handle special characters in a URL
    const encodedFilePath = encodeURIComponent(filePath);
    // OCS Share API requires prepending "/shares" to the encoded file path
    const ocsPath = `ocs/v1.php/apps/files_sharing/api/v1/shares?path=${encodedFilePath}&subfiles=true&reshares=true`;

    try {
        // Perform the OCS Share API request
        // TODO: Ensure that makeNextcloudApiRequest includes OCS-specific headers (OCS-APIREQUEST: true)
        // TODO: Add appropriate authentication headers (token or session cookie)
        const response = await makeNextcloudApiRequest(ocsPath, 'GET');

        // Check the API response for existing public links: response.ocs.data is an array of shares
        const hasPublicLink = response.ocs.data.some(share => {
            // Check if the share is of type "link" (share_type === 3 for public links)
            return share.share_type === 3;
        });

        return hasPublicLink;
    } catch (error) {
        console.error('Error checking for public link:', error);
        // TODO: Enhance error logging for better debugging: include function name, parameters, and error context
        displayUserError(`Failed to check for public link for "${filePath}": ${error.message}`);
        throw error; // Rethrow the error for handling by the caller
    }
}

/**
 * Creates a public link for a file if it doesn't exist.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<string>} Public link URL or null if unable to create.
 */
async function createPublicLink(filePath) {
    try {
        // Check if a public link already exists for the file
        const hasPublicLink = await checkPublicLink(filePath);
        if (hasPublicLink) {
            // TODO: Optimize by retrieving and returning the existing public link here
            throw new Error('A public link already exists for this file.');
        }

        // No public link exists, proceed with the creation
        const ocsPath = 'ocs/v1.php/apps/files_sharing/api/v1/shares';
        const baseUrl = getSetting('url');
        const url = `${baseUrl}/${ocsPath}`;

        const options = {
            method: 'POST',
            headers: {
                // TODO: Set the 'OCS-APIRequest' header to 'true' to denote an OCS API request
                // TODO: Add appropriate authentication headers (token or session cookie)
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            // TODO: Serialize body data according to Nextcloud API requirements
            body: `path=${encodeURIComponent(filePath)}&shareType=3&permissions=1`
        };

        // Make the request to create a new public link
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`Failed to create public link (${response.status}): ${response.statusText}`);
        }
        const responseData = await response.json();

        // Extract and return the public link URL
        // TODO: Ensure responseData contains the expected properties (e.g., 'url')
        return responseData.ocs.data.url;
    } catch (error) {
        console.error('Error creating public link:', error);
        // TODO: Enhance error logging for better debugging and user feedback
        displayUserError(`Failed to create public link for "${filePath}": ${error.message}`);
        // Depending on your error handling strategy, you may want to return null or throw the error
        return null;
    }
}

/**
 * Retrieves the public link of a file.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<string>} Public link or null if unable to retrieve or create.
 */
async function getPublicLink(filePath) {
    try {
        // Check if a public link already exists
        const hasPublicLink = await checkPublicLink(filePath);
        if (hasPublicLink) {
            // TODO: Retrieve the existing public link and return it
            // You might need to enhance the checkPublicLink function to return the link instead of boolean
            throw new Error('Public link retrieval not yet implemented.');
        } else {
            // If no link exists, create a new one
            return await createPublicLink(filePath);
        }
    } catch (error) {
        console.error('Error retrieving or creating public link:', error);
        // TODO: Enhance error logging for better debugging and user feedback
        displayUserError(`Failed to retrieve or create public link for "${filePath}": ${error.message}`);
        // Returning null if there is an error, but depending on your strategy you might want to throw
        return null;
    }
}

/**
 * Handles the selection of a file in the Nextcloud FilePicker.
 * @param {Object} file - Selected file object.
 * @returns {Promise<string>} Public link of the selected file or null if an error occurs.
 */
async function onSelectFile(file) {
    // Assuming file object contains a property 'path' that holds the file's path
    // TODO: Validate the file object structure and the existence of 'path' property
    const filePath = file.path;

    try {
        // Use getPublicLink to retrieve or create a public link for the selected file
        const publicLink = await getPublicLink(filePath);

        // TODO: Update the FilePicker UI with the public link (if necessary)
        
        return publicLink;
    } catch (error) {
        console.error('Error selecting file:', error);
        // TODO: Enhance error logging for better debugging and user feedback
        displayUserError(`Failed to select file and retrieve public link for "${filePath}": ${error.message}`);
        
        // Return null to indicate the failure in obtaining the public link
        return null;
    }
}

/**
 * Sets up the module, registers settings, and integrates the NextcloudFilePickerTab into FoundryVTT.
 */
function initializeModule() {
    // Register module settings
    registerSettings();

    // TODO: Define the NextcloudFilePickerTab functionality
    // and ensure that it is integrated into FoundryVTT's FilePicker interface
    // This might involve adding a new tab within the existing FilePicker UI
    // and handling the callbacks required to interact with Nextcloud API

    // TODO: Add initialization code for any API connectivity
    // For example, establish authentication procedures, and check for API availability

    try {
        // TODO: Implement any additional error handling and recovery needed during initialization
    } catch (error) {
        console.error(`Error initializing ${MODULE_NAME}:`, error);
        // TODO: Enhance error reporting and logging mechanisms
    }
}

// TODO: MODULE_NAME should be replaced with the actual name of your module

/**
 * Logs errors encountered during module operations and displays them in FoundryVTT's UI.
 * @param {Error} error - The error object to log.
 * @param {string} context - Additional context about where the error occurred.
 */
function logError(error, context = 'General') {
    // Format the current date and time
    const timestamp = new Date().toISOString();

    // Prepare the error message
    const errorMessage = error.message || 'Unknown error';

    // Log detailed error information to the console for debugging
    console.error(`[${timestamp}] Error in ${context}: ${errorMessage}`, error);

    // Display a user-friendly error message in FoundryVTT's UI
    let userFriendlyMessage = `An error occurred in ${context}. Please check the console for more details.`;
    ui.notifications.error(userFriendlyMessage);
}

Hooks.once('init', () => {
    // Implementation for registering Nextcloud settings in FoundryVTT
    // This is where saveCredentials functionality will be used
    // Trigger Condition: When the FoundryVTT environment is initializing
    registerSettings();
});

Hooks.once('ready', () => {
    // Code for any post-initialization setup
    // Trigger Condition: After FoundryVTT environment and modules are fully loaded and ready
    setupNextcloudTabListener();
});

Hooks.on('renderFilePicker', (filePicker, html, data) => {
    // Code to extend FilePicker with a Nextcloud tab
    // This will involve UI elements for Nextcloud navigation and file selection
    // Trigger Condition: When the FilePicker UI is rendered
    injectNextcloudTab();
});