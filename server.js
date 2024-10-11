const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(bodyParser.json());
app.use(express.static('public'));



// Endpoint to verify license
app.post('/verify-license', async (req, res) => {
    const { licenseKey } = req.body;

    try {
        const response = await fetch(`https://api.gumroad.com/v2/licenses/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GUMROAD_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                product_id: process.env.GUMROAD_PRODUCT_ID,
                license_key: licenseKey,
            }),
        });

        const data = await response.json();

        if (data.success) {
            const email = data.purchase.email;

            // Read the CSV file to check if the email is associated with a code
            const users = {};
            const codes = []; // To track available codes
            let emailFound = false;

            fs.createReadStream('users.csv')
                .pipe(csv())
                .on('data', (row) => {
                    users[row.email] = row.code;
                    if (!row.email) {
                        codes.push(row.code); // Collect available codes
                    }
                })
                .on('end', () => {
                    if (users[email]) {
                        // If email already exists in the CSV, return the associated code
                        res.json({ code: users[email] });
                    } else if (codes.length > 0) {
                        // If no email found but there's an available code, add the email to CSV
                        const newCode = codes[0]; // Take the first available code

                        // Read the CSV, modify it, and save it back with the new email added
                        const rows = [];
                        fs.createReadStream('users.csv')
                            .pipe(parse({ columns: true }))
                            .on('data', (row) => {
                                if (!row.email && row.code === newCode) {
                                    row.email = email; // Add the new email to the first available slot
                                }
                                rows.push(row);
                            })
                            .on('end', () => {
                                // Write the modified rows back to the CSV
                                stringify(rows, { header: true }, (err, output) => {
                                    if (err) {
                                        return res.status(500).json({ error: 'CSV-Error: Updating' });
                                    }
                                    fs.writeFile('users.csv', output, (err) => {
                                        if (err) {
                                            return res.status(500).json({ error: 'CSV-Error: Saving.' });
                                        }
                                        res.json({ code: newCode });
                                    });
                                });
                            });
                    } else {
                        // If no codes are available
                        res.json({ error: 'Error: Please Contact us!' });
                    }
                });
        } else {
            res.status(400).json({ error: data.message || 'License key not valid.' });
        }
    } catch (error) {
        console.error('Error verifying the license:', error);
        res.status(500).json({ error: 'Something went wrong.' });
    }
});



// Default route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
