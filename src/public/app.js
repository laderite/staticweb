document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const clientsTable = document.getElementById('clients-table');
    const clientCount = document.getElementById('client-count');
    const clientSelect = document.getElementById('client-select');
    const commandSelect = document.getElementById('command-select');
    const messageParams = document.getElementById('message-params');
    const kickParams = document.getElementById('kick-params');
    const commandForm = document.getElementById('command-form');
    const commandResult = document.getElementById('command-result');

    // Fetch connected clients
    function fetchClients() {
        fetch('/api/clients')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch clients');
                }
                return response.json();
            })
            .then(clients => {
                updateClientTable(clients);
                updateClientCount(clients.length);
                updateClientSelect(clients);
            })
            .catch(error => {
                console.error('Error fetching clients:', error);
            });
    }

    // Update the clients table
    function updateClientTable(clients) {
        const tbody = clientsTable.querySelector('tbody');
        tbody.innerHTML = '';

        if (clients.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center">No clients connected</td>';
            tbody.appendChild(row);
            return;
        }

        clients.forEach(client => {
            const row = document.createElement('tr');
            
            // Format the connected time
            const connectedAt = new Date(client.connectedAt);
            const formattedTime = connectedAt.toLocaleString();
            
            row.innerHTML = `
                <td>${client.id}</td>
                <td>${escapeHtml(client.username)}</td>
                <td>${client.userId}</td>
                <td>${escapeHtml(client.gameName)}</td>
                <td>${client.jobId}</td>
                <td>${formattedTime}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-client-id="${client.id}" data-action="kick">Kick</button>
                    <button class="btn btn-primary btn-sm" data-client-id="${client.id}" data-action="message">Message</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // Add event listeners to action buttons
        const actionButtons = tbody.querySelectorAll('button[data-action]');
        actionButtons.forEach(button => {
            button.addEventListener('click', handleActionButton);
        });
    }

    // Update the client count badge
    function updateClientCount(count) {
        clientCount.textContent = `${count} client${count !== 1 ? 's' : ''} connected`;
    }

    // Update the client select dropdown
    function updateClientSelect(clients) {
        // Keep the "All Clients" option
        clientSelect.innerHTML = '<option value="all">All Clients</option>';
        
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = `${escapeHtml(client.username)} (ID: ${client.id})`;
            clientSelect.appendChild(option);
        });
    }

    // Handle command form submission
    commandForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const clientId = clientSelect.value;
        const command = commandSelect.value;
        let params = {};
        
        // Get command-specific parameters
        if (command === 'message') {
            params.message = document.getElementById('message-input').value;
        } else if (command === 'kick') {
            params.message = document.getElementById('kick-reason').value;
        }
        
        // Send the command
        sendCommand(clientId, command, params);
    });

    // Send command to server
    function sendCommand(clientId, command, params) {
        fetch('/api/send-command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId,
                command,
                params
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showCommandResult(data.message, 'success');
            } else {
                showCommandResult(data.error, 'error');
            }
        })
        .catch(error => {
            showCommandResult('Failed to send command: ' + error.message, 'error');
        });
    }

    // Show command result message
    function showCommandResult(message, type) {
        commandResult.textContent = message;
        commandResult.className = 'result-message ' + type;
        commandResult.style.display = 'block';
        
        // Hide the message after 5 seconds
        setTimeout(() => {
            commandResult.style.display = 'none';
        }, 5000);
    }

    // Handle action buttons in the client table
    function handleActionButton(event) {
        const button = event.currentTarget;
        const clientId = button.getAttribute('data-client-id');
        const action = button.getAttribute('data-action');
        
        if (action === 'kick') {
            const reason = prompt('Enter kick reason:');
            if (reason !== null) {
                sendCommand(clientId, 'kick', { message: reason });
            }
        } else if (action === 'message') {
            const message = prompt('Enter message:');
            if (message !== null) {
                sendCommand(clientId, 'message', { message });
            }
        }
    }

    // Toggle parameter inputs based on selected command
    commandSelect.addEventListener('change', function() {
        const command = this.value;
        
        if (command === 'message') {
            messageParams.style.display = 'block';
            kickParams.style.display = 'none';
        } else if (command === 'kick') {
            messageParams.style.display = 'none';
            kickParams.style.display = 'block';
        }
    });

    // Helper function to escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Fetch clients initially
    fetchClients();
    
    // Refresh client list every 5 seconds
    setInterval(fetchClients, 5000);
});