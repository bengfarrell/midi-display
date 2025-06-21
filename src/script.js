class MidiSysExReader {
    constructor() {
        this.midi = null;
        this.inputs = new Map();
        this.outputs = new Map();
        this.midiMessages = [];
        this.deviceIds = new Map();
        this.midiMappings = [];
        this.autoScroll = true;
        this.messageFilters = {
            sysex: true,
            notes: true,
            cc: true,
            pc: true,
            other: true
        };
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.statusLight = document.getElementById('midiStatus');
        this.statusText = document.getElementById('statusText');
        this.enableButton = document.getElementById('enableMidi');
        this.inputDevicesContainer = document.getElementById('inputDevices');
        this.outputDevicesContainer = document.getElementById('outputDevices');
        this.midiContainer = document.getElementById('midiMessages');
        this.deviceIdsContainer = document.getElementById('deviceIds');
        this.clearButton = document.getElementById('clearMessages');
        this.autoScrollCheckbox = document.getElementById('autoScroll');
        this.targetDeviceIdSelect = document.getElementById('targetDeviceId');
        this.sendIdentityRequestButton = document.getElementById('sendIdentityRequest');
        this.showSysExCheckbox = document.getElementById('showSysEx');
        this.showNotesCheckbox = document.getElementById('showNotes');
        this.showCCCheckbox = document.getElementById('showCC');
        this.showPCCheckbox = document.getElementById('showPC');
        this.showOtherCheckbox = document.getElementById('showOther');
        this.midiMappingsContainer = document.getElementById('midiMappings');
        this.clearMappingsButton = document.getElementById('clearMappings');
        this.importMappingsButton = document.getElementById('importMappings');
        this.exportMappingsButton = document.getElementById('exportMappings');
        this.exportMappingsCSVButton = document.getElementById('exportMappingsCSV');
        this.importFileInput = document.getElementById('importFileInput');
    }

    bindEvents() {
        this.enableButton.addEventListener('click', () => this.requestMidiAccess());
        this.clearButton.addEventListener('click', () => this.clearMessages());
        this.autoScrollCheckbox.addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
        });
        this.sendIdentityRequestButton.addEventListener('click', () => this.sendIdentityRequest());
        
        // Filter checkboxes
        this.showSysExCheckbox.addEventListener('change', (e) => {
            this.messageFilters.sysex = e.target.checked;
            this.refreshMessageDisplay();
        });
        this.showNotesCheckbox.addEventListener('change', (e) => {
            this.messageFilters.notes = e.target.checked;
            this.refreshMessageDisplay();
        });
        this.showCCCheckbox.addEventListener('change', (e) => {
            this.messageFilters.cc = e.target.checked;
            this.refreshMessageDisplay();
        });
        this.showPCCheckbox.addEventListener('change', (e) => {
            this.messageFilters.pc = e.target.checked;
            this.refreshMessageDisplay();
        });
        this.showOtherCheckbox.addEventListener('change', (e) => {
            this.messageFilters.other = e.target.checked;
            this.refreshMessageDisplay();
        });
        
        // Mappings controls
        this.clearMappingsButton.addEventListener('click', () => this.clearMappings());
        this.importMappingsButton.addEventListener('click', () => this.importMappings());
        this.exportMappingsButton.addEventListener('click', () => this.exportMappings());
        this.exportMappingsCSVButton.addEventListener('click', () => this.exportMappingsCSV());
        this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
    }

    async requestMidiAccess() {
        try {
            this.midi = await navigator.requestMIDIAccess({ sysex: true });
            this.updateStatus(true, 'MIDI Access: Connected');
            this.enableButton.textContent = 'MIDI Connected';
            this.enableButton.disabled = true;
            
            this.setupMidiInputs();
            this.setupMidiOutputs();
            this.midi.addEventListener('statechange', () => {
                this.setupMidiInputs();  
                this.setupMidiOutputs();
            });
        } catch (error) {
            console.error('Failed to get MIDI access:', error);
            this.updateStatus(false, 'MIDI Access: Failed - ' + error.message);
        }
    }

    updateStatus(isConnected, text) {
        this.statusLight.className = `status-light ${isConnected ? 'online' : 'offline'}`;
        this.statusText.textContent = text;
    }

    setupMidiInputs() {
        this.inputs.clear();
        this.inputDevicesContainer.innerHTML = '';

        if (this.midi.inputs.size === 0) {
            this.inputDevicesContainer.innerHTML = '<p class="no-devices">No MIDI input devices found</p>';
            return;
        }

        for (const input of this.midi.inputs.values()) {
            this.inputs.set(input.id, input);
            input.addEventListener('midimessage', (event) => this.handleMidiMessage(event, input));
            
            const deviceElement = this.createDeviceElement(input);
            this.inputDevicesContainer.appendChild(deviceElement);
        }
    }

    setupMidiOutputs() {
        this.outputs.clear();
        this.outputDevicesContainer.innerHTML = '';

        if (this.midi.outputs.size === 0) {
            this.outputDevicesContainer.innerHTML = '<p class="no-devices">No MIDI output devices found</p>';
            this.sendIdentityRequestButton.disabled = true;
            return;
        }

        for (const output of this.midi.outputs.values()) {
            this.outputs.set(output.id, output);
            
            const deviceElement = this.createDeviceElement(output);
            this.outputDevicesContainer.appendChild(deviceElement);
        }

        // Enable the identity request button if we have outputs
        this.sendIdentityRequestButton.disabled = false;
    }

    createDeviceElement(device) {
        const deviceDiv = document.createElement('div');
        deviceDiv.className = 'device-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'device-name';
        nameSpan.textContent = device.name || 'Unknown Device';
        
        const statusSpan = document.createElement('span');
        statusSpan.className = `device-status ${device.state === 'connected' ? 'connected' : ''}`;
        statusSpan.textContent = device.state;
        
        deviceDiv.appendChild(nameSpan);
        deviceDiv.appendChild(statusSpan);
        
        return deviceDiv;
    }

    handleMidiMessage(event, inputDevice) {
        const data = Array.from(event.data);
        console.log('MIDI message received from', inputDevice.name + ':', data.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
        
        // Process ALL MIDI messages
        this.processMidiMessage(data, event.timeStamp, inputDevice);
    }

    processMidiMessage(data, timeStamp, inputDevice) {
        const messageInfo = this.analyzeMidiMessage(data);
        const message = {
            data: data,
            timestamp: new Date(performance.timeOrigin + timeStamp),
            type: messageInfo.type,
            category: messageInfo.category,
            description: messageInfo.description,
            channel: messageInfo.channel,
            deviceId: messageInfo.deviceId,
            sourceName: inputDevice.name,
            sourceId: inputDevice.id
        };

        this.midiMessages.push(message);
        this.displayMidiMessage(message);
        
        if (message.deviceId !== null) {
            this.updateDeviceIdCount(message.deviceId, inputDevice);
        }

        if (this.autoScroll) {
            this.midiContainer.scrollTop = this.midiContainer.scrollHeight;
        }
    }

    analyzeMidiMessage(data) {
        if (data.length === 0) {
            return { type: 'Unknown', category: 'other', description: 'Empty message', channel: null, deviceId: null };
        }

        const statusByte = data[0];
        const messageType = statusByte & 0xF0;
        const channel = (statusByte & 0x0F) + 1; // MIDI channels are 1-16

        // System Exclusive (SysEx) messages
        if (statusByte === 0xF0) {
            const deviceId = this.extractSysExDeviceId(data);
            const sysexType = this.getSysExMessageType(data);
            let description = `SysEx: ${sysexType}`;
            
            // Enhanced description for Identity Reply
            if (data.length >= 5 && data[1] === 0x7E && data[3] === 0x06 && data[4] === 0x02) {
                const identityInfo = this.parseIdentityReply(data);
                description = `SysEx Identity Reply: ${identityInfo.manufacturer} - ${identityInfo.details}`;
                if (identityInfo.softwareRevision) {
                    description += ` (v${identityInfo.softwareRevision})`;
                }
            }
            
            return {
                type: sysexType,
                category: 'sysex',
                description: description,
                channel: null,
                deviceId: deviceId
            };
        }

        // Channel Voice Messages
        switch (messageType) {
            case 0x80: // Note Off
                return {
                    type: 'Note Off',
                    category: 'note',
                    description: `Note Off: ${this.getMidiNoteName(data[1])} (${data[1]}) Velocity: ${data[2]}`,
                    channel: channel,
                    deviceId: null
                };
            case 0x90: // Note On
                const velocity = data[2];
                return {
                    type: velocity > 0 ? 'Note On' : 'Note Off',
                    category: 'note',
                    description: `${velocity > 0 ? 'Note On' : 'Note Off'}: ${this.getMidiNoteName(data[1])} (${data[1]}) Velocity: ${velocity}`,
                    channel: channel,
                    deviceId: null
                };
            case 0xA0: // Polyphonic Key Pressure
                return {
                    type: 'Poly Pressure',
                    category: 'other',
                    description: `Poly Pressure: ${this.getMidiNoteName(data[1])} (${data[1]}) Pressure: ${data[2]}`,
                    channel: channel,
                    deviceId: null
                };
            case 0xB0: // Control Change
                return {
                    type: 'Control Change',
                    category: 'cc',
                    description: `CC: ${this.getControllerName(data[1])} Value: ${data[2]}`,
                    channel: channel,
                    deviceId: null
                };
            case 0xC0: // Program Change
                return {
                    type: 'Program Change',
                    category: 'program',
                    description: `PC: Program ${data[1]} (Bank ${Math.floor(data[1] / 8)} Patch ${(data[1] % 8) + 1})`,
                    channel: channel,
                    deviceId: null
                };
            case 0xD0: // Channel Pressure
                return {
                    type: 'Channel Pressure',
                    category: 'other',
                    description: `Channel Pressure: ${data[1]}`,
                    channel: channel,
                    deviceId: null
                };
            case 0xE0: // Pitch Bend
                const pitchValue = (data[2] << 7) | data[1];
                const pitchBend = pitchValue - 8192;
                return {
                    type: 'Pitch Bend',
                    category: 'pitchbend',
                    description: `Pitch Bend: ${pitchBend} (${pitchValue})`,
                    channel: channel,
                    deviceId: null
                };
        }

        // System Common Messages
        if (statusByte >= 0xF0) {
            switch (statusByte) {
                case 0xF1: // MTC Quarter Frame
                    return {
                        type: 'MTC Quarter Frame',
                        category: 'system',
                        description: `MTC Quarter Frame: ${data[1]}`,
                        channel: null,
                        deviceId: null
                    };
                case 0xF2: // Song Position Pointer
                    return {
                        type: 'Song Position',
                        category: 'system',
                        description: `Song Position: ${(data[2] << 7) | data[1]}`,
                        channel: null,
                        deviceId: null
                    };
                case 0xF3: // Song Select
                    return {
                        type: 'Song Select',
                        category: 'system',
                        description: `Song Select: ${data[1]}`,
                        channel: null,
                        deviceId: null
                    };
                case 0xF6: // Tune Request
                    return {
                        type: 'Tune Request',
                        category: 'system',
                        description: 'Tune Request',
                        channel: null,
                        deviceId: null
                    };
                case 0xF8: // Timing Clock
                    return {
                        type: 'Timing Clock',
                        category: 'system',
                        description: 'Timing Clock',
                        channel: null,
                        deviceId: null
                    };
                case 0xFA: // Start
                    return {
                        type: 'Start',
                        category: 'system',
                        description: 'Start',
                        channel: null,
                        deviceId: null
                    };
                case 0xFB: // Continue
                    return {
                        type: 'Continue',
                        category: 'system',
                        description: 'Continue',
                        channel: null,
                        deviceId: null
                    };
                case 0xFC: // Stop
                    return {
                        type: 'Stop',
                        category: 'system',
                        description: 'Stop',
                        channel: null,
                        deviceId: null
                    };
                case 0xFE: // Active Sensing
                    return {
                        type: 'Active Sensing',
                        category: 'system',
                        description: 'Active Sensing',
                        channel: null,
                        deviceId: null
                    };
                case 0xFF: // System Reset
                    return {
                        type: 'System Reset',
                        category: 'system',
                        description: 'System Reset',
                        channel: null,
                        deviceId: null
                    };
            }
        }

        return {
            type: 'Unknown',
            category: 'other',
            description: `Unknown message: ${data.map(b => '0x' + b.toString(16).toUpperCase()).join(' ')}`,
            channel: null,
            deviceId: null
        };
    }

    extractSysExDeviceId(data) {
        // SysEx format: F0 [Manufacturer ID] [Device ID or Channel] ... F7
        // Common patterns for device ID extraction:
        
        if (data.length < 4) return null;

        // Pattern 1: Standard SysEx with manufacturer ID and device ID
        // F0 [Manufacturer] [Device ID] [Data...] F7
        if (data.length >= 4) {
            // Skip F0 and manufacturer ID (could be 1 or 3 bytes)
            let deviceIdIndex = 1;
            
            // Check for 3-byte manufacturer ID (starts with 0x00)
            if (data[1] === 0x00 && data.length >= 5) {
                deviceIdIndex = 4; // F0 00 XX XX [Device ID]
            } else {
                deviceIdIndex = 2; // F0 XX [Device ID]
            }
            
            if (deviceIdIndex < data.length - 1) {
                return data[deviceIdIndex];
            }
        }

        // Pattern 2: Universal SysEx (F0 7E or F0 7F)
        // F0 7E [Device ID] [Sub-ID] [Data...] F7
        // F0 7F [Device ID] [Sub-ID] [Data...] F7
        if (data.length >= 4 && (data[1] === 0x7E || data[1] === 0x7F)) {
            return data[2]; // Device ID is third byte
        }

        return null;
    }

    getMidiNoteName(noteNumber) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNumber / 12) - 1;
        const note = noteNames[noteNumber % 12];
        return `${note}${octave}`;
    }

    getControllerName(ccNumber) {
        const controllers = {
            0: 'Bank Select MSB', 1: 'Modulation', 2: 'Breath Controller', 4: 'Foot Controller',
            5: 'Portamento Time', 6: 'Data Entry MSB', 7: 'Channel Volume', 8: 'Balance',
            10: 'Pan', 11: 'Expression', 12: 'Effect Control 1', 13: 'Effect Control 2',
            16: 'General Purpose 1', 17: 'General Purpose 2', 18: 'General Purpose 3', 19: 'General Purpose 4',
            32: 'Bank Select LSB', 38: 'Data Entry LSB', 64: 'Sustain Pedal', 65: 'Portamento',
            66: 'Sostenuto', 67: 'Soft Pedal', 68: 'Legato Footswitch', 69: 'Hold 2',
            70: 'Sound Variation', 71: 'Timbre/Harmonic Intensity', 72: 'Release Time', 73: 'Attack Time',
            74: 'Brightness', 75: 'Sound Control 6', 76: 'Sound Control 7', 77: 'Sound Control 8',
            78: 'Sound Control 9', 79: 'Sound Control 10', 80: 'General Purpose 5', 81: 'General Purpose 6',
            82: 'General Purpose 7', 83: 'General Purpose 8', 84: 'Portamento Control',
            91: 'Effects Depth', 92: 'Tremolo Depth', 93: 'Chorus Depth', 94: 'Detune Depth',
            95: 'Phaser Depth', 96: 'Data Increment', 97: 'Data Decrement',
            98: 'NRPN LSB', 99: 'NRPN MSB', 100: 'RPN LSB', 101: 'RPN MSB',
            120: 'All Sound Off', 121: 'Reset All Controllers', 122: 'Local Control',
            123: 'All Notes Off', 124: 'Omni Mode Off', 125: 'Omni Mode On',
            126: 'Mono Mode On', 127: 'Poly Mode On'
        };
        
        const controllerName = controllers[ccNumber];
        if (controllerName) {
            return `${controllerName} (CC${ccNumber})`;
        } else {
            return `CC${ccNumber}`;
        }
    }

    displayMidiMessage(message) {
        // Check if message should be displayed based on filters
        if (!this.shouldDisplayMessage(message)) {
            return;
        }

        if (this.midiContainer.querySelector('.no-messages')) {
            this.midiContainer.innerHTML = '';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `midi-message ${message.category}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'message-timestamp';
        timestampSpan.textContent = message.timestamp.toLocaleTimeString() + '.' + 
                                   String(message.timestamp.getMilliseconds()).padStart(3, '0');

        const lengthSpan = document.createElement('span');
        lengthSpan.className = 'message-length';
        lengthSpan.textContent = `${message.data.length} bytes`;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'message-type';
        typeSpan.textContent = message.type;

        const channelSpan = document.createElement('span');
        channelSpan.className = 'message-channel';
        if (message.channel !== null) {
            channelSpan.textContent = `Ch ${message.channel}`;
        }

        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'message-source';
        sourceSpan.textContent = message.sourceName;
        sourceSpan.title = `Source: ${message.sourceName}`;

        headerDiv.appendChild(timestampSpan);
        headerDiv.appendChild(lengthSpan);
        headerDiv.appendChild(typeSpan);
        if (message.channel !== null) {
            headerDiv.appendChild(channelSpan); 
        }
        headerDiv.appendChild(sourceSpan);

        const descriptionDiv = document.createElement('div');
        descriptionDiv.className = 'message-description';
        descriptionDiv.textContent = message.description;

        const dataDiv = document.createElement('div');
        dataDiv.className = 'message-data';
        
        // Format the data with device ID highlighting for SysEx
        const formattedData = message.category === 'sysex' ? 
            this.formatSysExData(message.data, message.deviceId) :
            this.formatMidiData(message.data);
        dataDiv.innerHTML = formattedData;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const labelButton = document.createElement('button');
        labelButton.className = 'btn-label';
        labelButton.textContent = 'Label';
        labelButton.addEventListener('click', () => this.labelMidiMessage(message));
        
        actionsDiv.appendChild(labelButton);

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(descriptionDiv);
        messageDiv.appendChild(dataDiv);
        messageDiv.appendChild(actionsDiv);
        
        this.midiContainer.appendChild(messageDiv);
    }

    shouldDisplayMessage(message) {
        switch (message.category) {
            case 'sysex': return this.messageFilters.sysex;
            case 'note': return this.messageFilters.notes;
            case 'cc': return this.messageFilters.cc;
            case 'program': return this.messageFilters.pc;
            case 'pitchbend': return this.messageFilters.other;
            case 'system': return this.messageFilters.other;
            default: return this.messageFilters.other;
        }
    }

    refreshMessageDisplay() {
        this.midiContainer.innerHTML = '';
        if (this.midiMessages.length === 0) {
            this.midiContainer.innerHTML = '<p class="no-messages">No MIDI messages received yet</p>';
            return;
        }

        this.midiMessages.forEach(message => {
            this.displayMidiMessage(message);
        });

        if (this.autoScroll) {
            this.midiContainer.scrollTop = this.midiContainer.scrollHeight;
        }
    }

    formatMidiData(data) {
        return data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    }

    formatSysExData(data, deviceId) {
        let formatted = '';
        let deviceIdIndex = -1;

        // Find device ID position for highlighting
        if (deviceId !== null) {
            if (data[1] === 0x7E || data[1] === 0x7F) {
                deviceIdIndex = 2;
            } else if (data[1] === 0x00 && data.length >= 5) {
                deviceIdIndex = 4;
            } else {
                deviceIdIndex = 2;
            }
        }

        for (let i = 0; i < data.length; i++) {
            const hex = data[i].toString(16).toUpperCase().padStart(2, '0');
            
            if (i === deviceIdIndex) {
                formatted += `<span class="device-id-highlight">${hex}</span>`;
            } else {
                formatted += hex;
            }
            
            if (i < data.length - 1) {
                formatted += ' ';
            }
        }

        return formatted;
    }

    updateDeviceIdCount(deviceId, inputDevice) {
        if (this.deviceIds.has(deviceId)) {
            const device = this.deviceIds.get(deviceId);
            device.count++;
            device.lastSeen = new Date();
            
            // Add this source device if not already tracked
            if (!device.sourceDevices.some(src => src.id === inputDevice.id)) {
                device.sourceDevices.push({
                    id: inputDevice.id,
                    name: inputDevice.name,
                    firstSeen: new Date()
                });
            }
        } else {
            this.deviceIds.set(deviceId, {
                id: deviceId,
                count: 1,
                firstSeen: new Date(),
                lastSeen: new Date(),
                sourceDevices: [{
                    id: inputDevice.id,
                    name: inputDevice.name,
                    firstSeen: new Date()
                }]
            });
        }

        this.displayDeviceIds();
    }

    displayDeviceIds() {
        if (this.deviceIds.size === 0) {
            this.deviceIdsContainer.innerHTML = '<p class="no-device-ids">No device IDs detected yet</p>';
            return;
        }

        this.deviceIdsContainer.innerHTML = '';

        // Sort by count (most frequent first)
        const sortedDeviceIds = Array.from(this.deviceIds.values()).sort((a, b) => b.count - a.count);

        sortedDeviceIds.forEach(device => {
            const deviceDiv = document.createElement('div');
            deviceDiv.className = 'device-id-item';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'device-id-header';

            const valueSpan = document.createElement('span');
            valueSpan.className = 'device-id-value';
            const readableInfo = this.getDeviceIdReadableInfo(device.id);
            valueSpan.textContent = `Device ID: ${readableInfo.display}`;

            const countSpan = document.createElement('span');
            countSpan.className = 'device-id-count';
            countSpan.textContent = `${device.count} message${device.count !== 1 ? 's' : ''}`;

            headerDiv.appendChild(valueSpan);
            headerDiv.appendChild(countSpan);

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'device-id-details';
            
            const formatInfo = document.createElement('div');
            formatInfo.className = 'device-id-formats';
            formatInfo.innerHTML = `
                <strong>Formats:</strong> Hex: 0x${device.id.toString(16).toUpperCase().padStart(2, '0')} | 
                Decimal: ${device.id} | 
                Binary: ${device.id.toString(2).padStart(8, '0')}
            `;
            
            const meaningInfo = document.createElement('div');
            meaningInfo.className = 'device-id-meaning';
            meaningInfo.innerHTML = `<strong>Meaning:</strong> ${readableInfo.meaning}`;
            
            // Device source correlation
            const sourceInfo = document.createElement('div');
            sourceInfo.className = 'device-id-sources';
            const sourceNames = device.sourceDevices.map(src => src.name).join(', ');
            sourceInfo.innerHTML = `<strong>Source Device${device.sourceDevices.length > 1 ? 's' : ''}:</strong> ${sourceNames}`;
            
            const timestampInfo = document.createElement('div');
            timestampInfo.className = 'device-id-timestamps';
            timestampInfo.textContent = `First seen: ${device.firstSeen.toLocaleTimeString()}, Last seen: ${device.lastSeen.toLocaleTimeString()}`;

            detailsDiv.appendChild(formatInfo);
            detailsDiv.appendChild(meaningInfo);
            detailsDiv.appendChild(sourceInfo);
            detailsDiv.appendChild(timestampInfo);

            deviceDiv.appendChild(headerDiv);
            deviceDiv.appendChild(detailsDiv);

            this.deviceIdsContainer.appendChild(deviceDiv);
        });
    }

    clearMessages() {
        this.midiMessages = [];
        this.deviceIds.clear();
        this.midiContainer.innerHTML = '<p class="no-messages">No MIDI messages received yet</p>';
        this.deviceIdsContainer.innerHTML = '<p class="no-device-ids">No device IDs detected yet</p>';
    }

    sendIdentityRequest() {
        if (this.outputs.size === 0) {
            alert('No MIDI output devices available');
            return;
        }

        const targetDeviceId = parseInt(this.targetDeviceIdSelect.value);
        
        // MIDI Identity Request: F0 7E [device ID] 06 01 F7
        const identityRequest = [0xF0, 0x7E, targetDeviceId, 0x06, 0x01, 0xF7];

        let messagesSent = 0;
        
        // Send the identity request to all available output devices
        for (const output of this.outputs.values()) {
            if (output.state === 'connected') {
                try {
                    output.send(identityRequest);
                    messagesSent++;
                    console.log(`Sent identity request to ${output.name}:`, identityRequest.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
                } catch (error) {
                    console.error(`Failed to send identity request to ${output.name}:`, error);
                }
            }
        }

        if (messagesSent > 0) {
            // Show a temporary status message
            const originalText = this.sendIdentityRequestButton.textContent;
            this.sendIdentityRequestButton.textContent = `Sent to ${messagesSent} device${messagesSent !== 1 ? 's' : ''}`;
            this.sendIdentityRequestButton.disabled = true;
            
            setTimeout(() => {
                this.sendIdentityRequestButton.textContent = originalText;
                this.sendIdentityRequestButton.disabled = false;
            }, 2000);
        } else {
            alert('No connected output devices found');
        }
    }

    getDeviceIdReadableInfo(deviceId) {
        let display, meaning;

        switch (deviceId) {
            case 0:
                display = "0x00 (0) - First Device";
                meaning = "First device in chain or single device";
                break;
            case 1:
                display = "0x01 (1) - Second Device";
                meaning = "Second device in MIDI chain";
                break;
            case 2:
                display = "0x02 (2) - Third Device";
                meaning = "Third device in MIDI chain";
                break;
            case 3:
                display = "0x03 (3) - Fourth Device";
                meaning = "Fourth device in MIDI chain";
                break;
            case 4:
                display = "0x04 (4) - Fifth Device";
                meaning = "Fifth device in MIDI chain";
                break;
            case 5:
                display = "0x05 (5) - Sixth Device";
                meaning = "Sixth device in MIDI chain";
                break;
            case 6:
                display = "0x06 (6) - Seventh Device";
                meaning = "Seventh device in MIDI chain";
                break;
            case 7:
                display = "0x07 (7) - Eighth Device";
                meaning = "Eighth device in MIDI chain";
                break;
            case 8:
                display = "0x08 (8) - Ninth Device";
                meaning = "Ninth device in MIDI chain";
                break;
            case 9:
                display = "0x09 (9) - Tenth Device";
                meaning = "Tenth device in MIDI chain";
                break;
            case 10:
                display = "0x0A (10) - Eleventh Device";
                meaning = "Eleventh device in MIDI chain";
                break;
            case 11:
                display = "0x0B (11) - Twelfth Device";
                meaning = "Twelfth device in MIDI chain";
                break;
            case 12:
                display = "0x0C (12) - Thirteenth Device";
                meaning = "Thirteenth device in MIDI chain";
                break;
            case 13:
                display = "0x0D (13) - Fourteenth Device";
                meaning = "Fourteenth device in MIDI chain";
                break;
            case 14:
                display = "0x0E (14) - Fifteenth Device";
                meaning = "Fifteenth device in MIDI chain";
                break;
            case 15:
                display = "0x0F (15) - Sixteenth Device";
                meaning = "Sixteenth device in MIDI chain";
                break;
            case 16:
                display = "0x10 (16) - MIDI Channel 1";
                meaning = "Often used as MIDI Channel 1 (base-1 numbering)";
                break;
            case 17:
                display = "0x11 (17) - MIDI Channel 2";
                meaning = "Often used as MIDI Channel 2 (base-1 numbering)";
                break;
            case 127:
                display = "0x7F (127) - Broadcast/All Devices";
                meaning = "Universal broadcast address - targets all devices";
                break;
            default:
                if (deviceId >= 16 && deviceId <= 31) {
                    const channel = deviceId - 15;
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId}) - MIDI Channel ${channel}`;
                    meaning = `Often corresponds to MIDI Channel ${channel} (base-1 numbering)`;
                } else if (deviceId >= 32 && deviceId <= 47) {
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId}) - Extended Device Range`;
                    meaning = "Extended device addressing for larger setups";
                } else if (deviceId >= 48 && deviceId <= 63) {
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId}) - Multi-Port Device`;
                    meaning = "Often used for multi-port or multi-timbral devices";
                } else if (deviceId >= 64 && deviceId <= 95) {
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId}) - Manufacturer Specific`;
                    meaning = "Manufacturer-specific device ID range";
                } else if (deviceId >= 96 && deviceId <= 126) {
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId}) - Custom/Reserved`;
                    meaning = "Custom or reserved device ID range";
                } else {
                    display = `0x${deviceId.toString(16).toUpperCase().padStart(2, '0')} (${deviceId})`;
                    meaning = "Custom device ID - check device documentation";
                }
                break;
        }

        return { display, meaning };
    }

    labelMidiMessage(message) {
        const label = prompt('Enter a label for this MIDI controller:');
        if (label && label.trim()) {
            this.addMidiMapping(message, label.trim());
        }
    }

    addMidiMapping(message, label) {
        // Create a unique identifier for the MIDI message (excluding timestamp and value)
        const mappingKey = this.createMappingKey(message);
        
        // Check if this mapping already exists
        const existingIndex = this.midiMappings.findIndex(mapping => mapping.key === mappingKey);
        
        const mapping = {
            key: mappingKey,
            label: label,
            type: message.type,
            category: message.category,
            channel: message.channel,
            description: this.createMappingDescription(message),
            data: this.createMappingData(message),
            timestamp: new Date()
        };

        if (existingIndex >= 0) {
            // Update existing mapping
            this.midiMappings[existingIndex] = mapping;
        } else {
            // Add new mapping
            this.midiMappings.push(mapping);
        }

        this.displayMappings();
    }

    createMappingKey(message) {
        // Create a unique key based on message type and relevant data (excluding timestamp and value)
        const data = message.data;
        const statusByte = data[0];
        const messageType = statusByte & 0xF0;
        const channel = statusByte & 0x0F;

        switch (messageType) {
            case 0x80: // Note Off
            case 0x90: // Note On
            case 0xA0: // Polyphonic Key Pressure
                return `${messageType.toString(16)}-${channel}-${data[1]}`; // Type-Channel-Note
            case 0xB0: // Control Change
                return `${messageType.toString(16)}-${channel}-${data[1]}`; // Type-Channel-Controller
            case 0xC0: // Program Change
                return `${messageType.toString(16)}-${channel}`; // Type-Channel
            case 0xD0: // Channel Pressure
                return `${messageType.toString(16)}-${channel}`; // Type-Channel
            case 0xE0: // Pitch Bend
                return `${messageType.toString(16)}-${channel}`; // Type-Channel
            default:
                if (statusByte === 0xF0) {
                    // SysEx - use first few bytes as identifier
                    return `f0-${data.slice(1, 4).map(b => b.toString(16)).join('-')}`;
                }
                return `${statusByte.toString(16)}`; // System messages
        }
    }

    createMappingDescription(message) {
        // Create description without timestamp and value-specific info
        const data = message.data;
        const statusByte = data[0];
        const messageType = statusByte & 0xF0;
        const channel = (statusByte & 0x0F) + 1;

        switch (messageType) {
            case 0x80: // Note Off
            case 0x90: // Note On
                return `Note: ${this.getMidiNoteName(data[1])} (${data[1]}) on Channel ${channel}`;
            case 0xA0: // Polyphonic Key Pressure
                return `Poly Pressure: ${this.getMidiNoteName(data[1])} (${data[1]}) on Channel ${channel}`;
            case 0xB0: // Control Change
                return `CC: ${this.getControllerName(data[1])} (${data[1]}) on Channel ${channel}`;
            case 0xC0: // Program Change
                return `Program Change on Channel ${channel}`;
            case 0xD0: // Channel Pressure
                return `Channel Pressure on Channel ${channel}`;
            case 0xE0: // Pitch Bend
                return `Pitch Bend on Channel ${channel}`;
            default:
                if (statusByte === 0xF0) {
                    return `SysEx: ${this.getSysExMessageType(data)}`;
                }
                return message.description;
        }
    }

    createMappingData(message) {
        // Create data representation without value-specific bytes
        const data = message.data;
        const statusByte = data[0];
        const messageType = statusByte & 0xF0;

        switch (messageType) {
            case 0x80: // Note Off
            case 0x90: // Note On
            case 0xA0: // Polyphonic Key Pressure
            case 0xB0: // Control Change
                return `${statusByte.toString(16).toUpperCase().padStart(2, '0')} ${data[1].toString(16).toUpperCase().padStart(2, '0')} XX`;
            case 0xC0: // Program Change
            case 0xD0: // Channel Pressure
                return `${statusByte.toString(16).toUpperCase().padStart(2, '0')} XX`;
            case 0xE0: // Pitch Bend
                return `${statusByte.toString(16).toUpperCase().padStart(2, '0')} XX XX`;
            default:
                if (statusByte === 0xF0) {
                    // For SysEx, show the structure without variable data
                    return data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                }
                return data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        }
    }

    displayMappings() {
        if (this.midiMappings.length === 0) {
            this.midiMappingsContainer.innerHTML = '<p class="no-mappings">No MIDI controllers labeled yet</p>';
            return;
        }

        this.midiMappingsContainer.innerHTML = '';

        // Sort mappings by label
        const sortedMappings = [...this.midiMappings].sort((a, b) => a.label.localeCompare(b.label));

        sortedMappings.forEach(mapping => {
            const mappingDiv = document.createElement('div');
            mappingDiv.className = 'mapping-item';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'mapping-header';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'mapping-label';
            labelSpan.textContent = mapping.label;

            const typeSpan = document.createElement('span');
            typeSpan.className = 'mapping-type';
            typeSpan.textContent = mapping.type;

            headerDiv.appendChild(labelSpan);
            headerDiv.appendChild(typeSpan);

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'mapping-details';
            detailsDiv.textContent = mapping.description;

            const dataDiv = document.createElement('div');
            dataDiv.className = 'mapping-data';
            dataDiv.textContent = mapping.data;

            mappingDiv.appendChild(headerDiv);
            mappingDiv.appendChild(detailsDiv);
            mappingDiv.appendChild(dataDiv);

            this.midiMappingsContainer.appendChild(mappingDiv);
        });
    }

    clearMappings() {
        if (confirm('Are you sure you want to clear all MIDI controller mappings?')) {
            this.midiMappings = [];
            this.displayMappings();
        }
    }

    exportMappings() {
        if (this.midiMappings.length === 0) {
            alert('No mappings to export');
            return;
        }

        const exportData = {
            timestamp: new Date().toISOString(),
            mappings: this.midiMappings.map(mapping => ({
                label: mapping.label,
                type: mapping.type,
                category: mapping.category,
                channel: mapping.channel,
                description: mapping.description,
                data: mapping.data
            }))
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `midi-mappings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportMappingsCSV() {
        if (this.midiMappings.length === 0) {
            alert('No mappings to export');
            return;
        }

        // Create CSV header
        const headers = ['Label', 'Type', 'Category', 'Channel', 'Description', 'Data Pattern'];
        
        // Create CSV rows
        const rows = this.midiMappings.map(mapping => [
            this.escapeCSVField(mapping.label),
            this.escapeCSVField(mapping.type),
            this.escapeCSVField(mapping.category),
            mapping.channel || '',
            this.escapeCSVField(mapping.description),
            this.escapeCSVField(mapping.data)
        ]);

        // Combine header and rows
        const csvContent = [headers, ...rows]
            .map(row => row.join(','))
            .join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `midi-mappings-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    escapeCSVField(field) {
        if (field == null) return '';
        
        const stringField = String(field);
        
        // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
        if (stringField.includes(',') || stringField.includes('\n') || stringField.includes('"')) {
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        
        return stringField;
    }

    importMappings() {
        this.importFileInput.click();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
            alert('Please select a JSON file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.processImportedMappings(jsonData);
            } catch (error) {
                alert('Error reading JSON file: ' + error.message);
            }
        };

        reader.onerror = () => {
            alert('Error reading file');
        };

        reader.readAsText(file);
        
        // Reset the file input so the same file can be selected again
        event.target.value = '';
    }

    processImportedMappings(jsonData) {
        // Validate the JSON structure
        if (!this.validateImportedData(jsonData)) {
            alert('Invalid JSON format. Please ensure you\'re importing a file exported from this application.');
            return;
        }

        const importedMappings = jsonData.mappings;
        const existingCount = this.midiMappings.length;
        let importedCount = 0;
        let updatedCount = 0;

        // Ask user how to handle existing mappings
        let mergeMode = 'merge';
        if (existingCount > 0) {
            const choice = confirm(
                `You have ${existingCount} existing mappings.\n\n` +
                'Click OK to merge (update existing, add new)\n' +
                'Click Cancel to replace all existing mappings'
            );
            mergeMode = choice ? 'merge' : 'replace';
        }

        if (mergeMode === 'replace') {
            this.midiMappings = [];
        }

        // Process each imported mapping
        importedMappings.forEach(mapping => {
            // Recreate the mapping key for consistency
            const mappingKey = this.createMappingKeyFromImport(mapping);
            
            const processedMapping = {
                key: mappingKey,
                label: mapping.label,
                type: mapping.type,
                category: mapping.category,
                channel: mapping.channel,
                description: mapping.description,
                data: mapping.data,
                timestamp: new Date()
            };

            const existingIndex = this.midiMappings.findIndex(existing => existing.key === mappingKey);
            
            if (existingIndex >= 0) {
                this.midiMappings[existingIndex] = processedMapping;
                updatedCount++;
            } else {
                this.midiMappings.push(processedMapping);
                importedCount++;
            }
        });

        // Update display
        this.displayMappings();

        // Show success message
        let message = `Import successful!\n`;
        if (mergeMode === 'replace') {
            message += `Replaced all mappings with ${importedMappings.length} imported mappings.`;
        } else {
            message += `Added ${importedCount} new mappings.`;
            if (updatedCount > 0) {
                message += `\nUpdated ${updatedCount} existing mappings.`;
            }
        }
        
        if (jsonData.timestamp) {
            message += `\n\nImported from: ${new Date(jsonData.timestamp).toLocaleString()}`;
        }
        
        alert(message);
    }

    validateImportedData(jsonData) {
        // Check if it has the expected structure
        if (!jsonData || typeof jsonData !== 'object') return false;
        if (!Array.isArray(jsonData.mappings)) return false;

        // Check if mappings have required fields
        return jsonData.mappings.every(mapping => 
            mapping &&
            typeof mapping.label === 'string' &&
            typeof mapping.type === 'string' &&
            typeof mapping.category === 'string' &&
            typeof mapping.description === 'string' &&
            typeof mapping.data === 'string'
        );
    }

    createMappingKeyFromImport(mapping) {
        // Try to recreate the mapping key from imported data
        // This ensures consistency with keys created from live MIDI messages
        
        // For most cases, we can derive the key from the data pattern
        const data = mapping.data;
        const parts = data.split(' ');
        
        if (parts.length === 0) return data;
        
        const statusByte = parseInt(parts[0], 16);
        const messageType = statusByte & 0xF0;
        const channel = statusByte & 0x0F;

        switch (messageType) {
            case 0x80: // Note Off
            case 0x90: // Note On
            case 0xA0: // Polyphonic Key Pressure
            case 0xB0: // Control Change
                if (parts.length >= 2) {
                    const secondByte = parseInt(parts[1], 16);
                    return `${messageType.toString(16)}-${channel}-${secondByte}`;
                }
                break;
            case 0xC0: // Program Change
            case 0xD0: // Channel Pressure
            case 0xE0: // Pitch Bend
                return `${messageType.toString(16)}-${channel}`;
            default:
                if (statusByte === 0xF0) {
                    // SysEx - use first few data bytes
                    const dataBytes = parts.slice(1, 4).map(b => parseInt(b, 16));
                    return `f0-${dataBytes.join('-')}`;
                }
                return `${statusByte.toString(16)}`;
        }

        // Fallback to using the data as key
        return data.replace(/ /g, '-');
    }

    getSysExMessageType(data) {
        if (data.length < 3) return 'Unknown';
        
        // Universal System Exclusive messages
        if (data[1] === 0x7E) {
            if (data.length >= 5 && data[3] === 0x06) {
                if (data[4] === 0x01) return 'Identity Request';
                if (data[4] === 0x02) {
                    const identityInfo = this.parseIdentityReply(data);
                    return `Identity Reply (${identityInfo.manufacturer})`;
                }
            }
            return 'Universal Non-Real Time';
        }
        
        if (data[1] === 0x7F) {
            return 'Universal Real Time';
        }
        
        // Manufacturer-specific messages
        if (data[1] === 0x00) {
            // 3-byte manufacturer ID
            const mfgId = (data[2] << 8) | data[3];
            const mfgName = this.getManufacturerName(mfgId, true);
            return `Mfg Specific (${mfgName})`;
        } else {
            // 1-byte manufacturer ID
            const mfgName = this.getManufacturerName(data[1], false);
            return `Mfg Specific (${mfgName})`;
        }
    }

    parseIdentityReply(data) {
        // Identity Reply format: F0 7E [device ID] 06 02 [manufacturer ID] [device family] [device family member] [software revision] F7
        if (data.length < 10) {
            return { manufacturer: 'Unknown', details: 'Incomplete message' };
        }

        const deviceId = data[2];
        const manufacturerId = data[5];
        const deviceFamily = (data[7] << 8) | data[6]; // Little-endian
        const deviceFamilyMember = (data[9] << 8) | data[8]; // Little-endian
        
        let softwareRevision = '';
        if (data.length >= 14) {
            // Software revision can be 4 bytes
            const rev1 = data[10];
            const rev2 = data[11];
            const rev3 = data[12];
            const rev4 = data[13];
            softwareRevision = `${rev1}.${rev2}.${rev3}.${rev4}`;
        } else if (data.length >= 12) {
            // Sometimes just 2 bytes
            const rev1 = data[10];
            const rev2 = data[11];
            softwareRevision = `${rev1}.${rev2}`;
        }

        const manufacturer = this.getManufacturerName(manufacturerId, false);
        
        return {
            manufacturer: manufacturer,
            deviceId: deviceId,
            manufacturerId: manufacturerId,
            deviceFamily: deviceFamily,
            deviceFamilyMember: deviceFamilyMember,
            softwareRevision: softwareRevision,
            details: this.getDeviceDetails(manufacturerId, deviceFamily, deviceFamilyMember)
        };
    }

    getManufacturerName(id, isThreeByte = false) {
        // MIDI Manufacturer IDs
        const manufacturers = {
            // 1-byte IDs
            0x01: 'Sequential Circuits',
            0x02: 'Big Briar',
            0x03: 'Octave/Plateau',
            0x04: 'Moog',
            0x05: 'Passport Designs',
            0x06: 'Lexicon',
            0x07: 'Kurzweil',
            0x08: 'Fender',
            0x09: 'Gulbransen',
            0x0A: 'Delta Labs',
            0x0B: 'Sound Comp.',
            0x0C: 'General Electro',
            0x0D: 'Techmar',
            0x0E: 'Matthews Research',
            0x10: 'Oberheim',
            0x11: 'PAIA',
            0x12: 'Simmons',
            0x13: 'DigiDesign',
            0x14: 'Fairlight',
            0x15: 'JL Cooper',
            0x16: 'Lowrey',
            0x17: 'Lin',
            0x18: 'Emu',
            0x1B: 'Peavey',
            0x20: 'Bon Tempi',
            0x21: 'S.I.E.L',
            0x23: 'SynTech',
            0x24: 'ElKa',
            0x25: 'Dynacord',
            0x26: 'Jomox',
            0x27: 'Soundcraft',
            0x29: 'Metra Sound',
            0x2A: 'C.T.M.',
            0x2B: 'SST',
            0x2C: 'Sonic',
            0x2D: 'Lettron',
            0x2E: 'Matsushita',
            0x2F: 'Fostex',
            0x30: 'Zoom',
            0x31: 'Miditemp',
            0x32: 'Beatnik Inc',
            0x33: 'Enjoy',
            0x34: 'ENSONIQ',
            0x35: 'E-mu',
            0x36: 'BoBo',
            0x37: 'General Music',
            0x38: 'Tornado',
            0x39: 'Blue Chip',
            0x3E: 'Lone Wolf',
            0x40: 'Kawai',
            0x41: 'Roland',
            0x42: 'Korg',
            0x43: 'Yamaha',
            0x44: 'Casio',
            0x45: 'Aesis',
            0x47: 'Akai',
            0x48: 'Victor',
            0x49: 'Meidiland',
            0x4A: 'Matsushita',
            0x4B: 'Fostex',
            0x4C: 'Zoom',
            0x4D: 'Matsushita',
            0x4E: 'Suzuki',
            0x4F: 'Fuji Sound',
            0x50: 'Acoustic tech lab',
            0x51: 'Faith',
            0x52: 'Internet',
            0x54: 'Masked',
            0x55: 'Suzuki',
            0x56: 'Matsushita',
            0x57: 'Audio Trak',
            0x58: 'ProAudioSpectrum',
            0x59: 'Millennium',
            0x5A: 'Euphorics',
            0x5B: 'Kurzweil Young Chang'
        };

        if (isThreeByte) {
            // 3-byte manufacturer IDs (extended range)
            const threeByte = {
                0x002B: 'Midisoft Corporation',
                0x0030: 'Software Audio Workshop',
                0x0031: 'Dream BBS',
                0x0032: 'M-Audio',
                0x0033: 'Zeal Soft',
                0x0034: 'Studio Logic',
                0x0035: 'Mackie Designs',
                0x0036: 'Presonus',
                0x0037: 'Topaz Enterprises',
                0x0038: 'Cast Lighting',
                0x0039: 'Microsoft',
                // Add more as needed
            };
            return threeByte[id] || `Unknown (${id.toString(16).toUpperCase().padStart(4, '0')})`;
        }

        return manufacturers[id] || `Unknown (0x${id.toString(16).toUpperCase().padStart(2, '0')})`;
    }

    getDeviceDetails(manufacturerId, deviceFamily, deviceFamilyMember) {
        // Known device families for major manufacturers
        if (manufacturerId === 0x47) { // Akai
            const akaiDevices = {
                0x0026: { // Device Family 38
                    name: 'MPC Series',
                    members: {
                        0x0019: 'MPC Live/X/One', // Device Family Member 25
                        0x001A: 'MPC Touch',
                        0x001B: 'MPC Renaissance',
                        0x001C: 'MPC Studio',
                        0x001D: 'MPC Element'
                    }
                },
                0x0010: {
                    name: 'S-Series',
                    members: {
                        0x0001: 'S1000',
                        0x0002: 'S2000',
                        0x0003: 'S3000'
                    }
                }
            };
            
            const family = akaiDevices[deviceFamily];
            if (family) {
                const member = family.members[deviceFamilyMember];
                return member ? `${family.name} - ${member}` : `${family.name} (Member ${deviceFamilyMember})`;
            }
        } else if (manufacturerId === 0x41) { // Roland
            // Add Roland device families as needed
        } else if (manufacturerId === 0x43) { // Yamaha
            // Add Yamaha device families as needed
        }

        return `Family: ${deviceFamily}, Member: ${deviceFamilyMember}`;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check for Web MIDI API support
    if (!navigator.requestMIDIAccess) {
        alert('Web MIDI API is not supported in this browser. Please use Chrome, Edge, or Opera.');
        return;
    }

    new MidiSysExReader();
}); 