        function hexToRgba(hex, alpha) {
            const bigint = parseInt(hex.slice(1), 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        // Global variables
        let spcData = [];
        let currentPeriod = new Date();
        let currentPeriodType = 'week'; // week, month, quarter, year
        let currentChartType = 'lm-lv';
        let charts = {};
        let validationErrors = [];
        const SHIFTS = ['Matin', 'Après-midi', 'Nuit']; // Ordre chronologique des postes
        let currentViewMode = 'classic'; // classic, table, or card
        let isPanMode = false;
        let selectedDataPoint = null;

        // NOUVEAU: Paramètres par défaut (Tolérances + Couleurs + Visuels)
        const DEFAULT_SETTINGS = {
            // Tolérances (USL/LSL)
            moyLmLv: { usl: 5.00, lsl: -5.00 },
            etdLmLv: { usl: 10.00, lsl: 0.00 },
            moyLdLr: { usl: 5.00, lsl: -5.00 },
            etdLdLr: { usl: 10.00, lsl: 0.00 },
            moyLargeur: { usl: 5.00, lsl: -5.00 },
            etdLargeur: { usl: 10.00, lsl: 0.00 },

            // Couleurs par défaut (customColors)
            customColors: {
                spc1: '#0d6efd',         // Bleu (primaire)
                spc2: '#198754',         // Vert (succès)
                spc3: '#dc3545',         // Rouge (danger)
                line: 'rgba(13, 110, 253, 0.6)', // Ligne du graphique (bleue)
                outOfToleranceDot: '#ff0000', // Point Hors Tolérance (rouge vif)
                toleranceLine: '#ff0000', // Ligne USL/LSL (rouge vif)
                toleranceZone: 'rgba(255, 99, 132, 0.05)', // Zone USL/LSL (rosé très transparent)
                trendLine: '#ffc107',    // Ligne de Tendance (jaune/warning)
            },

            // CORRIGÉ/AJUSTÉ: Couleurs des postes (Shift) pour l'arrière-plan du graphique
            shiftColors: {
                // Utilisation d'une opacité très basse par défaut pour éviter de masquer les données
                matin: 'rgba(173, 216, 230, 0.05)', // Light blue (très transparent)
                apresMidi: 'rgba(255, 255, 153, 0.05)', // Light yellow
                nuit: 'rgba(192, 192, 192, 0.05)' // Light gray
            },

            // NOUVEAU: Personnalisation des visuels du graphique
            chartCustomization: {
                pointRadius: 4,
                pointHoverRadius: 7,
                maxXTicksLimit: 30
            }
        };

        // Variable pour les paramètres chargés
        let spcSettings = {};
        let isConfigUser = false;

        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            // NOUVEAU: Enregistrer les plugins Chart.js
            Chart.register(window.ChartZoom, window.ChartAnnotation);

            // Load settings (includes tolerances and colors)
            loadSettings();
            checkLoginStatus();

            // Set current date in the form
            document.getElementById('date').valueAsDate = new Date();

            // Initialize event listeners
            initializeEventListeners();

            // Load initial data and update view
            loadDataFromStorage();
            updateDashboard();

            // Initialize period display
            updatePeriodDisplay();

            // Load first chart type
            loadChartType('lm-lv');
        });

        // Initialize event listeners
        function initializeEventListeners() {
            // Navigation - handle all navigation links
            document.querySelectorAll('[data-page]').forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const page = this.getAttribute('data-page');

                    // NOUVEAU: Vérification d'accès à la config
                    if (page === 'config' && !isConfigUser) {
                        showToast('Accès refusé. Veuillez vous connecter pour accéder à la Configuration.', 'danger');
                        return;
                    }

                    showPage(page);

                    // Update active nav link
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
                });
            });

            // Form submission
            document.getElementById('spcForm').addEventListener('submit', function(e) {
                e.preventDefault();
                saveFormData();
            });

            // Clear form button
            document.getElementById('clearForm').addEventListener('click', function() {
                clearForm();
            });

            // Delete entry button
            document.getElementById('deleteEntry').addEventListener('click', function() {
                deleteCurrentEntry();
            });

            // Refresh dashboard button
            document.getElementById('refreshDashboard').addEventListener('click', function() {
                updateDashboard();
                showToast('Tableau de bord actualisé', 'success');
            });

            // View charts button
            document.getElementById('viewChartsBtn').addEventListener('click', function() {
                showPage('graphiques');
                document.querySelector('[data-page="graphiques"]').classList.add('active');
                document.querySelector('[data-page="dashboard"]').classList.remove('active');
            });

            // Filter controls
            document.getElementById('filterPoste').addEventListener('change', updateDashboard);
            document.getElementById('filterEquipe').addEventListener('change', updateDashboard);
            document.getElementById('filterDate').addEventListener('change', updateDashboard);
            document.getElementById('filterStatus').addEventListener('change', updateDashboard);

            // Period navigation
            document.getElementById('prevPeriod').addEventListener('click', function() {
                navigatePeriod(-1);
            });

            document.getElementById('nextPeriod').addEventListener('click', function() {
                navigatePeriod(1);
            });

            // Period selector buttons
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentPeriodType = this.getAttribute('data-period');
                    updatePeriodDisplay();
                    loadChartType(currentChartType);
                });
            });

            // Chart navigation buttons
            document.querySelectorAll('.chart-nav-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const chartType = this.getAttribute('data-chart');
                    loadChartType(chartType);
                });
            });

            // Chart filters
            // Note: chartPosteFilter is disabled as all shifts are shown now
            document.getElementById('chartEquipeFilter').addEventListener('change', function() {
                loadChartType(currentChartType);
            });

            // Chart view selector buttons
            document.getElementById('classicViewBtn').addEventListener('click', function() {
                switchChartView('classic');
            });

            // MODIFIED: Rename detailedViewBtn to table view (logic remains 'table')
            document.getElementById('detailedViewBtn').addEventListener('click', function() {
                switchChartView('table');
            });

            // NOUVEAU: Card View button
            document.getElementById('cardViewBtn').addEventListener('click', function() {
                switchChartView('card');
            });

            // Chart controls
            document.getElementById('zoomInBtn').addEventListener('click', function() {
                zoomChart(1.2);
            });

            document.getElementById('zoomOutBtn').addEventListener('click', function() {
                zoomChart(0.8);
            });

            document.getElementById('resetZoomBtn').addEventListener('click', function() {
                resetChartZoom();
            });

            document.getElementById('panBtn').addEventListener('click', function() {
                togglePanMode();
            });

            document.getElementById('exportChartBtn').addEventListener('click', function() {
                exportCurrentChart();
            });

            // Advanced filters
            document.getElementById('toggleAdvancedFiltersBtn').addEventListener('click', function() {
                document.getElementById('advancedFilters').classList.toggle('hidden');
            });

            document.getElementById('applyAdvancedFilters').addEventListener('click', function() {
                applyAdvancedFilters();
            });

            // Validation page buttons
            document.getElementById('validateAllData').addEventListener('click', validateAllData);
            document.getElementById('clearAllData').addEventListener('click', clearAllData);
            document.getElementById('generateTestData').addEventListener('click', generateTestData);

            // Export/Import buttons
            document.getElementById('exportData').addEventListener('click', function(e) {
                e.preventDefault();
                exportData();
            });

            document.getElementById('importData').addEventListener('click', function(e) {
                e.preventDefault();
                document.getElementById('importFile').click();
            });

            document.getElementById('importFile').addEventListener('change', importData);

            // NOUVEAU: Formulaire de tolérance
            document.getElementById('toleranceForm')?.addEventListener('submit', function(e) {
                e.preventDefault();
                saveSettingsFromForm();
            });

            // NOUVEAU: Bouton de connexion/déconnexion
            document.getElementById('loginToggleBtn').addEventListener('click', toggleLogin);

            // NOUVEAU: Bouton pour le mode sombre
            document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

            // Appliquer le thème sombre si nécessaire
            if (localStorage.getItem('darkMode') === 'enabled') {
                document.body.classList.add('dark-mode');
            }
        }

        // NOUVEAU: Fonction pour basculer le mode sombre
        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('darkMode', 'enabled');
            } else {
                localStorage.removeItem('darkMode');
            }
        }

        // NOUVEAU: Gestionnaire de connexion simple (simulation de rôle "Config")
        function checkLoginStatus() {
            isConfigUser = sessionStorage.getItem('isConfigUser') === 'true';
            updateConfigAccessUI();
        }

        function toggleLogin() {
            if (isConfigUser) {
                // Déconnexion
                sessionStorage.removeItem('isConfigUser');
                showToast('Déconnexion réussie', 'info');
            } else {
                // Simulation de connexion par mot de passe
                const password = prompt("Entrez le mot de passe de configuration:");
                if (password === "spc") { // Mot de passe simple à des fins de démonstration
                    sessionStorage.setItem('isConfigUser', 'true');
                    showToast('Accès Configuration activé', 'success');
                } else if (password !== null) {
                    showToast('Mot de passe incorrect', 'danger');
                }
            }
            isConfigUser = sessionStorage.getItem('isConfigUser') === 'true';
            updateConfigAccessUI();
        }

        function updateConfigAccessUI() {
            const configNavLink = document.getElementById('configNavLink');
            const configDropdownLink = document.getElementById('configDropdownLink');
            const loginToggleBtn = document.getElementById('loginToggleBtn');

            if (isConfigUser) {
                configNavLink.style.display = 'block';
                configDropdownLink.style.display = 'block';
                loginToggleBtn.innerHTML = '<i class="bi bi-person-circle"></i> Déconnexion';
                loadSettingsToForm(); // Charger les valeurs si l'utilisateur vient de se connecter
            } else {
                configNavLink.style.display = 'none';
                configDropdownLink.style.display = 'none';
                loginToggleBtn.innerHTML = '<i class="bi bi-person-circle"></i> Connexion';
                // Si l'utilisateur est sur la page config, le rediriger
                if (document.getElementById('config-page').classList.contains('active')) {
                    showPage('dashboard');
                    document.querySelector('[data-page="dashboard"]').classList.add('active');
                    document.querySelector('[data-page="config"]').classList.remove('active');
                }
            }
        }

        // NOUVEAU: Fonctions utilitaires pour accéder aux propriétés imbriquées
        function getSettingValue(obj, path) {
            return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
        }

        function setSettingValue(obj, path, value) {
            const parts = path.split('.');
            let current = obj;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;
        }

        // NOUVEAU: Fonctions de gestion des Paramètres (Tolérances + Couleurs + Visuels)
        function loadSettings() {
            const storedSettings = localStorage.getItem('spcSettings');
            if (storedSettings) {
                // Fusionner avec les valeurs par défaut pour les nouvelles options et les propriétés imbriquées
                const loaded = JSON.parse(storedSettings);
                spcSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // Deep copy defaults

                // Merge customColors
                if (loaded.customColors) {
                    spcSettings.customColors = { ...spcSettings.customColors, ...loaded.customColors };
                }
                // Merge shiftColors
                if (loaded.shiftColors) {
                    spcSettings.shiftColors = { ...spcSettings.shiftColors, ...loaded.shiftColors };
                }
                // Merge chartCustomization
                if (loaded.chartCustomization) {
                    spcSettings.chartCustomization = { ...spcSettings.chartCustomization, ...loaded.chartCustomization };
                }
                // Merge tolerance settings (e.g., moyLmLv)
                Object.keys(DEFAULT_SETTINGS).filter(key => key.includes('LmLv') || key.includes('LdLr') || key.includes('Largeur')).forEach(key => {
                    if (loaded[key]) {
                        spcSettings[key] = { ...spcSettings[key], ...loaded[key] };
                    }
                });

            } else {
                spcSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // Deep copy defaults
            }
        }

        function saveSettings() {
            localStorage.setItem('spcSettings', JSON.stringify(spcSettings));
        }

        function loadSettingsToForm() {
            // Charger toutes les valeurs via les attributs data-field
            document.querySelectorAll('#toleranceForm input[data-field]').forEach(input => {
                const fieldPath = input.getAttribute('data-field');
                const value = getSettingValue(spcSettings, fieldPath);

                if (value !== undefined) {
                    // Pour les couleurs, charger directement la valeur
                    if (input.type === 'color') {
                        // Si la valeur est en RGBA, on doit la reconvertir en HEX pour l'input[type=color]
                        // C'est une simplification pour l'UX car l'input[type=color] ne supporte que HEX/RGB
                        if (typeof value === 'string' && value.startsWith('rgba')) {
                            // On essaie de garder uniquement la partie RGB (ou l'opacité peut être perdue/simplifiée)
                            // Pour simplifier l'UI, on suppose que l'utilisateur veut voir la couleur de base.
                            input.value = value.match(/#([a-fA-F0-9]{6})/)?.[0] || '#000000';
                        } else {
                             input.value = value;
                        }
                    } else {
                        // Pour les nombres/textes, charger la valeur
                        input.value = value;
                    }
                }
            });
        }

        function saveSettingsFromForm() {
            let newSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            let isValid = true;

            // Enregistrer les nouvelles valeurs
            document.querySelectorAll('#toleranceForm input[data-field]').forEach(input => {
                const fieldPath = input.getAttribute('data-field');
                let value;

                if (input.type === 'color') {
                    // Pour les couleurs de poste, on force l'enregistrement en RGBA avec une transparence par défaut
                    if (fieldPath.startsWith('shiftColors')) {
                        // On prend la couleur HEX de l'input et on y applique une opacité basse
                        value = hexToRgba(input.value, 0.05);
                    } else if (fieldPath === 'customColors.line' || fieldPath === 'customColors.toleranceZone') {
                        // Pour les autres couleurs transparentes, on pourrait aussi forcer une opacité
                        // Mais on fait confiance à l'input de l'utilisateur pour le moment, sauf pour le shift
                        value = input.value;
                    } else {
                        value = input.value;
                    }

                } else if (input.type === 'text') {
                    value = input.value;
                } else {
                    value = parseFloat(input.value);
                    if (isNaN(value)) {
                        showToast(`La valeur pour le champ ${fieldPath} n'est pas un nombre valide.`, 'danger');
                        isValid = false;
                        return;
                    }
                }

                setSettingValue(newSettings, fieldPath, value);
            });

            if (!isValid) return;

            spcSettings = newSettings;
            saveSettings();

            // Recharger les graphiques pour appliquer les nouveaux paramètres
            loadChartType(currentChartType);

            showToast('Paramètres enregistrés et appliqués', 'success');
        }

        // Show a specific page
        function showPage(pageId) {
            document.querySelectorAll('.page-content').forEach(page => {
                page.classList.add('hidden');
            });
            document.getElementById(`${pageId}-page`).classList.remove('hidden');

            // Add fade-in animation
            document.getElementById(`${pageId}-page`).classList.add('fade-in');

            // If validation page, run validation
            if (pageId === 'validation') {
                validateAllData();
            }
            // NOUVEAU: Si page config, charger les valeurs
            if (pageId === 'config') {
                loadSettingsToForm();
            }
        }

        // Switch chart view mode (MODIFIED to include 'card' view)
        function switchChartView(mode) {
            currentViewMode = mode;

            // Update button states
            document.getElementById('classicViewBtn').classList.toggle('active', mode === 'classic');
            document.getElementById('detailedViewBtn').classList.toggle('active', mode === 'table');
            document.getElementById('cardViewBtn').classList.toggle('active', mode === 'card');

            // Hide all containers
            document.getElementById('chartContent').classList.add('hidden');
            document.getElementById('dataTableContainer').classList.add('hidden');
            document.getElementById('cardViewContainer').classList.add('hidden');
            document.getElementById('dataPointDetails').classList.add('hidden');
            document.getElementById('chartLegendContainer').classList.add('hidden');

            // Show appropriate elements and load data
            if (mode === 'classic') {
                document.getElementById('chartContent').classList.remove('hidden');
                document.getElementById('chartLegendContainer').classList.remove('hidden');
                // Reload chart type to display graphs again (in case it was loaded in card/table view)
                loadChartType(currentChartType, getCurrentAdvancedFilters());
            } else if (mode === 'table') {
                document.getElementById('dataTableContainer').classList.remove('hidden');
                loadDataTable();
            } else if (mode === 'card') {
                document.getElementById('cardViewContainer').classList.remove('hidden');
                // Reload chart type to get data points (they are returned only when loading charts)
                loadChartType(currentChartType, getCurrentAdvancedFilters());
            }
        }

        // Load data table for detailed view
        function loadDataTable() {
            const tableBody = document.getElementById('dataTableBody');
            tableBody.innerHTML = '';

            // Get filter values
            const filterEquipe = document.getElementById('chartEquipeFilter').value;

            // Get period dates
            const periodDates = getPeriodDates(currentPeriod);

            // Determine the field names based on currentChartType
            let field;
            switch (currentChartType) {
                case 'lm-lv':
                    field = 'moyLmLv';
                    break;
                case 'ld-lr':
                    field = 'moyLdLr';
                    break;
                case 'largeur':
                    field = 'moyLargeur';
                    break;
                case 'hqt-hqp':
                    field = 'hqt1';
                    break;
            }

            // Collect data for the table
            const tableData = [];

            periodDates.forEach(date => {
                SHIFTS.forEach(shift => {
                    for (let spc = 1; spc <= 3; spc++) {
                        const entry = spcData.find(e =>
                            e.date === date &&
                            e.poste === shift &&
                            (!filterEquipe || e.equipe === filterEquipe) &&
                            e[`spc${spc}`]
                        );

                        if (entry && entry[`spc${spc}`] && entry[`spc${spc}`][field]) {
                            tableData.push({
                                date: date,
                                poste: shift,
                                equipe: entry.equipe,
                                spc: spc,
                                value: parseFloat(entry[`spc${spc}`][field]),
                                entry: entry,
                                field: field
                            });
                        }
                    }
                });
            });

            // Sort data by date and shift
            tableData.sort((a, b) => {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return SHIFTS.indexOf(a.poste) - SHIFTS.indexOf(b.poste);
            });

            // Populate table
            tableData.forEach(data => {
                const row = document.createElement('tr');

                // Date cell
                const dateCell = document.createElement('td');
                dateCell.textContent = data.date;
                row.appendChild(dateCell);

                // Poste cell
                const posteCell = document.createElement('td');
                posteCell.textContent = data.poste;
                row.appendChild(posteCell);

                // Équipe cell
                const equipeCell = document.createElement('td');
                equipeCell.textContent = data.equipe;
                row.appendChild(equipeCell);

                // SPC cell
                const spcCell = document.createElement('td');
                spcCell.textContent = `SPC ${data.spc}`;
                row.appendChild(spcCell);

                // Value cell
                const valueCell = document.createElement('td');
                valueCell.textContent = data.value.toFixed(2);

                // Color code based on value and tolerance
                const tolerance = spcSettings[data.field] || {};

                if (data.value < tolerance.lsl || data.value > tolerance.usl) {
                    valueCell.className = 'text-danger pulse'; // Utilisation de la classe pulse
                } else if (data.field.startsWith('etd') && data.value > (tolerance.usl * 0.8)) {
                    valueCell.className = 'text-warning';
                } else {
                    valueCell.className = 'text-success';
                }

                row.appendChild(valueCell);

                // Actions cell
                const actionsCell = document.createElement('td');
                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-primary';
                viewButton.innerHTML = '<i class="bi bi-eye"></i> Détails';
                viewButton.addEventListener('click', function() {
                    showDataPointDetails(data);
                });
                actionsCell.appendChild(viewButton);
                row.appendChild(actionsCell);

                tableBody.appendChild(row);
            });

            // If no data, show a message
            if (tableData.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 6;
                cell.className = 'text-center';
                cell.textContent = 'Aucune donnée trouvée pour les critères sélectionnés';
                row.appendChild(cell);
                tableBody.appendChild(row);
            }
        }

        // Load card view for detailed data presentation (NEW FUNCTION)
        function loadCardView(dataPoints) {
            const cardsRow = document.getElementById('cardsRow');
            cardsRow.innerHTML = ''; // Clear previous cards

            // Filter out null/empty data points and add the field property for tolerance check
            const validDataPoints = dataPoints.flat().filter(p => p !== null && p.value !== null && !isNaN(p.value));

            if (validDataPoints.length === 0) {
                cardsRow.innerHTML = '<div class="col-12"><p class="alert alert-info">Aucune donnée trouvée pour l\'affichage Fiches.</p></div>';
                return;
            }

            validDataPoints.forEach(dataPoint => {
                // Determine the SPC color for the card border
                const spc = dataPoint.spc;
                const colorIndex = spc >= 1 && spc <= 3 ? spc - 1 : 0;
                const borderColor = spcSettings.customColors[`spc${spc}`] || DEFAULT_SETTINGS.customColors[`spc${spc}`];

                // Check for out of tolerance to add a pulse effect or different style
                const field = dataPoint.field;
                const tolerance = spcSettings[field] || {};
                const isOutOfTolerance = dataPoint.value < tolerance.lsl || dataPoint.value > tolerance.usl;
                const pulseClass = isOutOfTolerance ? 'pulse border-danger' : 'border-success';

                // Display average or specific team
                const equipeText = dataPoint.equipe ? `<p class="card-text mb-0"><strong>Équipe:</strong> ${dataPoint.equipe}</p>` :
                                                      `<p class="card-text mb-0"><strong>Équipes:</strong> Moyenne (${dataPoint.entries.length})</p>`;

                // Create a Bootstrap Card for the detail
                const cardHtml = `
                    <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
                        <div class="card shadow-sm border-start border-5 ${pulseClass}" style="border-left-color: ${borderColor} !important;">
                            <div class="card-body">
                                <h6 class="card-title text-primary">${dataPoint.date.substring(5)} - ${dataPoint.poste.substring(0, 1)} - SPC${spc}</h6>
                                <p class="card-text mb-0"><strong>Valeur (${field}):</strong> <span class="fw-bold ${isOutOfTolerance ? 'text-danger' : 'text-success'}">${dataPoint.value.toFixed(2)}</span></p>
                                ${equipeText}
                                <div class="mt-2">
                                    <button class="btn btn-sm btn-outline-primary view-details-btn"
                                        data-date="${dataPoint.date}" data-poste="${dataPoint.poste}"
                                        data-equipe="${dataPoint.equipe || 'average'}" data-spc="${spc}" data-field="${field}">
                                        Détails
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                cardsRow.insertAdjacentHTML('beforeend', cardHtml);
            });

            // Add event listeners to the new detail buttons
            cardsRow.querySelectorAll('.view-details-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const date = this.getAttribute('data-date');
                    const poste = this.getAttribute('data-poste');
                    const equipe = this.getAttribute('data-equipe');
                    const spc = parseInt(this.getAttribute('data-spc'));
                    const field = this.getAttribute('data-field');

                    // Find the original entry
                    const entry = spcData.find(e => e.date === date && e.poste === poste && e.equipe === (equipe === 'average' ? undefined : equipe));

                    if (entry) {
                        // Construct a data object suitable for showDataPointDetails
                        const data = {
                            date: date,
                            poste: poste,
                            equipe: entry.equipe,
                            spc: spc,
                            value: parseFloat(entry[`spc${spc}`][field]),
                            entry: entry,
                            field: field
                        };
                        showDataPointDetails(data);
                    } else {
                        showToast('Erreur: Donnée source introuvable. Affichage des détails d\'une entrée moyenne.', 'warning');
                        // Fallback to average entry details if available
                        const averageEntry = validDataPoints.find(p => p.date === date && p.poste === poste && p.spc === spc && !p.equipe);
                        if (averageEntry && averageEntry.entries && averageEntry.entries.length > 0) {
                            showDataPointDetails({
                                ...averageEntry.entries[0],
                                value: averageEntry.value
                            });
                        }
                    }
                });
            });
        }

        // Show data point details in a modal
        function showDataPointDetails(data) {
            const modalBody = document.getElementById('dataPointDetailsModalBody');
            const modalTitle = document.getElementById('dataPointDetailsModalLabel');

            // Get all data for this entry
            const spcDataEntry = data.entry[`spc${data.spc}`];

            // Set modal title
            modalTitle.textContent = `Détails du Point: ${data.date} - ${data.poste} - SPC${data.spc}`;

            // Populate modal body
            modalBody.innerHTML = `
                <div class="container-fluid">
                    <div class="row">
                        <div class="col-md-6">
                            <h5>Identification</h5>
                            <p><strong>Date:</strong> ${data.date}</p>
                            <p><strong>Poste:</strong> ${data.poste}</p>
                            <p><strong>Équipe:</strong> ${data.equipe}</p>
                            <p><strong>SPC:</strong> ${data.spc}</p>
                            <p><strong>N° Tôle 1:</strong> ${spcDataEntry.tole1 || 'N/A'}</p>
                            <p><strong>N° Tôle 2:</strong> ${spcDataEntry.tole2 || 'N/A'}</p>
                            <p><strong>N° Tôle 3:</strong> ${spcDataEntry.tole3 || 'N/A'}</p>
                        </div>
                        <div class="col-md-6">
                            <h5>Métriques Principales</h5>
                            <p><strong>Moy(Lm-Lv):</strong> ${spcDataEntry.moyLmLv || 'N/A'}</p>
                            <p><strong>Etd(Lm-Lv):</strong> ${spcDataEntry.etdLmLv || 'N/A'}</p>
                            <p><strong>Moy(Ld-Lr):</strong> ${spcDataEntry.moyLdLr || 'N/A'}</p>
                            <p><strong>Etd(Ld-Lr):</strong> ${spcDataEntry.etdLdLr || 'N/A'}</p>
                            <p><strong>Moy(Largeur):</strong> ${spcDataEntry.moyLargeur || 'N/A'}</p>
                            <p><strong>Etd(Largeur):</strong> ${spcDataEntry.etdLargeur || 'N/A'}</p>
                        </div>
                    </div>
                    <hr>
                    <div class="row">
                        <div class="col-md-6">
                            <h5>Métriques HQT</h5>
                            <p><strong>HQT 1:</strong> ${spcDataEntry.hqt1 || 'N/A'}</p>
                            <p><strong>HQT 2:</strong> ${spcDataEntry.hqt2 || 'N/A'}</p>
                            <p><strong>HQT 3:</strong> ${spcDataEntry.hqt3 || 'N/A'}</p>
                        </div>
                        <div class="col-md-6">
                            <h5>Métriques HQP</h5>
                            <p><strong>HQP 1:</strong> ${spcDataEntry.hqp1 || 'N/A'}</p>
                            <p><strong>HQP 2:</strong> ${spcDataEntry.hqp2 || 'N/A'}</p>
                            <p><strong>HQP 3:</strong> ${spcDataEntry.hqp3 || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            `;

            // Show the modal
            const dataPointModal = new bootstrap.Modal(document.getElementById('dataPointDetailsModal'));
            dataPointModal.show();

            // Add event listener for edit button in modal
            const modalEditButton = document.getElementById('modalEditDataPointBtn');

            // Clone and replace to remove old listeners
            const newEditButton = modalEditButton.cloneNode(true);
            modalEditButton.parentNode.replaceChild(newEditButton, modalEditButton);

            newEditButton.addEventListener('click', function() {
                loadEntryToForm(data.entry);
                dataPointModal.hide(); // Hide the modal before navigating
                showPage('saisie');
                document.querySelector('[data-page="saisie"]').classList.add('active');
                document.querySelector('[data-page="graphiques"]').classList.remove('active');
            });
        }

        // Zoom chart
        function zoomChart(factor) {
            Object.values(charts).forEach(chart => {
                if (chart) {
                    chart.zoom(factor);
                }
            });
        }

        // Reset chart zoom
        function resetChartZoom() {
            Object.values(charts).forEach(chart => {
                if (chart) {
                    chart.resetZoom();
                }
            });
        }

        // Toggle pan mode
        function togglePanMode() {
            isPanMode = !isPanMode;
            const panBtn = document.getElementById('panBtn');

            if (isPanMode) {
                panBtn.classList.add('active');
                panBtn.style.backgroundColor = 'var(--primary-color)';
                panBtn.style.color = 'white';

                Object.values(charts).forEach(chart => {
                    if (chart) {
                        chart.options.plugins.zoom.pan.enabled = true;
                        chart.update();
                    }
                });
            } else {
                panBtn.classList.remove('active');
                panBtn.style.backgroundColor = 'white';
                panBtn.style.color = 'var(--secondary-color)';

                Object.values(charts).forEach(chart => {
                    if (chart) {
                        chart.options.plugins.zoom.pan.enabled = false;
                        chart.update();
                    }
                });
            }
        }

        // Export current chart
        function exportCurrentChart() {
            // Find the active chart
            const activeTab = document.querySelector('.tab-pane.show.active');
            if (!activeTab) return;

            // Find all canvas elements in the active tab
            const canvases = activeTab.querySelectorAll('canvas');

            // Export each canvas
            canvases.forEach((canvas, index) => {
                const url = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `chart_${currentChartType}_${index + 1}_${formatDate(new Date())}.png`;
                link.href = url;
                link.click();
            });

            showToast('Graphique exporté avec succès', 'success');
        }

        // Helper function to get current advanced filter values
        function getCurrentAdvancedFilters() {
            const minValue = parseFloat(document.getElementById('minValueFilter').value);
            const maxValue = parseFloat(document.getElementById('maxValueFilter').value);
            const outlierFilter = document.getElementById('outlierFilter').value;
            const smoothingFilter = document.getElementById('smoothingFilter').value;
            const trendLineFilter = document.getElementById('trendLineFilter').value;

            return {
                minValue: isNaN(minValue) ? null : minValue,
                maxValue: isNaN(maxValue) ? null : maxValue,
                outlierFilter: outlierFilter,
                smoothingFilter: smoothingFilter,
                trendLineFilter: trendLineFilter
            };
        }

        // Apply advanced filters
        function applyAdvancedFilters() {
            const advancedFilters = getCurrentAdvancedFilters();

            // Reload chart with filters
            loadChartType(currentChartType, advancedFilters);

            showToast('Filtres avancés appliqués', 'success');
        }

        // Load data from localStorage
        function loadDataFromStorage() {
            const storedData = localStorage.getItem('spcData');
            if (storedData) {
                spcData = JSON.parse(storedData);
            } else {
                // Initialize with sample data if no data exists
                initializeSampleData();
            }
        }

        // Save data to localStorage
        function saveDataToStorage() {
            localStorage.setItem('spcData', JSON.stringify(spcData));
        }

        // Initialize with sample data
        function initializeSampleData() {
            const today = new Date();
            const sampleData = [];

            // Generate sample data for the last 30 days
            for (let i = 0; i < 30; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);

                for (let poste of ['Matin', 'Après-midi', 'Nuit']) {
                    for (let equipe of ['A', 'B', 'C', 'D']) {
                        const entry = {
                            id: generateId(),
                            date: formatDate(date),
                            poste: poste,
                            equipe: equipe,
                            spc1: {
                                moyLmLv: (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: `T${Math.floor(Math.random() * 1000)}`,
                                tole2: `T${Math.floor(Math.random() * 1000)}`,
                                tole3: `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            },
                            spc2: Math.random() > 0.3 ? {
                                moyLmLv: (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: `T${Math.floor(Math.random() * 1000)}`,
                                tole2: `T${Math.floor(Math.random() * 1000)}`,
                                tole3: `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            } : null,
                            spc3: Math.random() > 0.5 ? {
                                moyLmLv: (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: `T${Math.floor(Math.random() * 1000)}`,
                                tole2: `T${Math.floor(Math.random() * 1000)}`,
                                tole3: `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            } : null
                        };

                        sampleData.push(entry);
                    }
                }
            }

            spcData = sampleData;
            saveDataToStorage();
        }

        // Generate test data with some errors
        function generateTestData() {
            const today = new Date();
            const testData = [];

            // Generate test data with some intentional errors
            for (let i = 0; i < 10; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);

                for (let poste of ['Matin', 'Après-midi', 'Nuit']) {
                    for (let equipe of ['A', 'B', 'C', 'D']) {
                        // Create some entries with errors
                        const hasErrors = Math.random() > 0.7;

                        const entry = {
                            id: generateId(),
                            date: formatDate(date),
                            poste: poste,
                            equipe: equipe,
                            spc1: {
                                moyLmLv: hasErrors && Math.random() > 0.5 ? 'invalid' : (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: hasErrors && Math.random() > 0.5 ? -5 : (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: hasErrors ? '' : `T${Math.floor(Math.random() * 1000)}`,
                                tole2: hasErrors ? '' : `T${Math.floor(Math.random() * 1000)}`,
                                tole3: hasErrors ? '' : `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            },
                            spc2: Math.random() > 0.3 ? {
                                moyLmLv: (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: `T${Math.floor(Math.random() * 1000)}`,
                                tole2: `T${Math.floor(Math.random() * 1000)}`,
                                tole3: `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            } : null,
                            spc3: Math.random() > 0.5 ? {
                                moyLmLv: (Math.random() * 10 - 5).toFixed(2),
                                etdLmLv: (Math.random() * 10).toFixed(2),
                                moyLdLr: (Math.random() * 10 - 5).toFixed(2),
                                etdLdLr: (Math.random() * 10).toFixed(2),
                                moyLargeur: (Math.random() * 10 - 5).toFixed(2),
                                etdLargeur: (Math.random() * 10).toFixed(2),
                                tole1: `T${Math.floor(Math.random() * 1000)}`,
                                tole2: `T${Math.floor(Math.random() * 1000)}`,
                                tole3: `T${Math.floor(Math.random() * 1000)}`,
                                hqt1: (Math.random() * 100).toFixed(2),
                                hqt2: (Math.random() * 100).toFixed(2),
                                hqt3: (Math.random() * 100).toFixed(2),
                                hqp1: (Math.random() * 100).toFixed(2),
                                hqp2: (Math.random() * 100).toFixed(2),
                                hqp3: (Math.random() * 100).toFixed(2)
                            } : null
                        };

                        testData.push(entry);
                    }
                }
            }

            spcData = testData;
            saveDataToStorage();
            updateDashboard();
            showToast('Données de test générées avec erreurs', 'warning');

            // Show validation page
            showPage('validation');
            document.querySelector('[data-page="validation"]').classList.add('active');
            document.querySelector('[data-page="dashboard"]').classList.remove('active');
        }

        // Validate all data
        function validateAllData() {
            validationErrors = [];

            spcData.forEach((entry, index) => {
                for (let spc = 1; spc <= 3; spc++) {
                    const spcDataEntry = entry[`spc${spc}`];
                    if (spcDataEntry) {
                        const errors = validateSpcData(spcDataEntry, entry, spc);
                        if (errors.length > 0) {
                            validationErrors.push({
                                entryIndex: index,
                                entry: entry,
                                spc: spc,
                                errors: errors
                            });
                        }
                    }
                }
            });

            displayValidationErrors();
            updateValidationReport();
        }

        // Validate SPC data
        function validateSpcData(data, entry, spc) {
            const errors = [];

            // Check for numeric values
            const numericFields = ['moyLmLv', 'etdLmLv', 'moyLdLr', 'etdLdLr', 'moyLargeur', 'etdLargeur', 'hqt1', 'hqt2', 'hqt3', 'hqp1', 'hqp2', 'hqp3'];
            numericFields.forEach(field => {
                if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
                    const value = parseFloat(data[field]);
                    if (isNaN(value)) {
                        errors.push({
                            field: field,
                            message: `La valeur "${data[field]}" n'est pas un nombre valide`
                        });
                    } else {
                        // Check against configured or default tolerances
                        const tolerance = spcSettings[field] || (field.startsWith('moy') ? { usl: 12, lsl: -10 } : field.startsWith('etd') ? { usl: 20, lsl: 0 } : { usl: 200, lsl: 0 });

                        if (value < tolerance.lsl || value > tolerance.usl) {
                             errors.push({
                                field: field,
                                message: `La valeur ${value} est hors de la plage de tolérance (LSL: ${tolerance.lsl}, USL: ${tolerance.usl})`
                            });
                        }
                    }
                }
            });

            // Check for required fields
            if ((!data.tole1 || data.tole1.trim() === '') &&
                (!data.tole2 || data.tole2.trim() === '') &&
                (!data.tole3 || data.tole3.trim() === '')) {
                errors.push({
                    field: 'tole',
                    message: 'Au moins un numéro de tôle est requis'
                });
            }

            return errors;
        }

        // Display validation errors
        function displayValidationErrors() {
            const errorsList = document.getElementById('errorsList');
            errorsList.innerHTML = '';

            if (validationErrors.length === 0) {
                errorsList.innerHTML = '<p class="text-success">Aucune erreur de validation trouvée!</p>';
                return;
            }

            validationErrors.forEach((error, index) => {
                const errorItem = document.createElement('div');
                errorItem.className = 'error-item';
                errorItem.innerHTML = `
                    <div class="error-details">
                        <strong>${error.entry.date} - ${error.entry.poste} - Équipe ${error.entry.equipe} - SPC${error.spc}</strong>
                    </div>
                    <ul class="mb-0">
                        ${error.errors.map(err => `<li>${err.field}: ${err.message}</li>`).join('')}
                    </ul>
                    <div class="error-actions">
                        <button class="btn btn-sm btn-warning" onclick="fixEntry(${error.entryIndex}, ${error.spc})">
                            <i class="bi bi-wrench"></i> Corriger
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteEntryByIndex(${error.entryIndex})">
                            <i class="bi bi-trash"></i> Supprimer
                        </button>
                    </div>
                `;
                errorsList.appendChild(errorItem);
            });
        }

        // Update validation report
        function updateValidationReport() {
            const report = document.getElementById('validationReport');
            const totalEntries = spcData.length;
            const errorEntries = new Set(validationErrors.map(err => err.entry.id)).size; // Count unique entries with errors
            const validEntries = totalEntries - errorEntries;

            report.innerHTML = `
                <div class="row">
                    <div class="col-md-3">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title">Total des entrées</h5>
                                <h3 class="text-primary">${totalEntries}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title">Entrées valides</h5>
                                <h3 class="text-success">${validEntries}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title">Entrées avec erreurs</h5>
                                <h3 class="text-danger">${errorEntries}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title">Taux de validité</h5>
                                <h3 class="text-info">${totalEntries > 0 ? Math.round((validEntries / totalEntries) * 100) : 0}%</h3>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Fix entry
        function fixEntry(entryIndex, spc) {
            const entry = spcData[entryIndex];
            const spcDataEntry = entry[`spc${spc}`];

            // Fix common errors
            if (spcDataEntry) {
                // Fix numeric values
                const numericFields = ['moyLmLv', 'etdLmLv', 'moyLdLr', 'etdLdLr', 'moyLargeur', 'etdLargeur', 'hqt1', 'hqt2', 'hqt3', 'hqp1', 'hqp2', 'hqp3'];
                numericFields.forEach(field => {
                    const tolerance = spcSettings[field] || (field.startsWith('moy') ? { usl: 12, lsl: -10 } : field.startsWith('etd') ? { usl: 20, lsl: 0 } : { usl: 200, lsl: 0 });

                    if (spcDataEntry[field] !== undefined && spcDataEntry[field] !== null && spcDataEntry[field] !== '') {
                        const value = parseFloat(spcDataEntry[field]);
                        if (isNaN(value)) {
                            // Replace with default value or a value within tolerance
                            spcDataEntry[field] = (tolerance.lsl + (tolerance.usl - tolerance.lsl) / 2).toFixed(2);
                        } else {
                            // Clamp to valid range
                            spcDataEntry[field] = Math.max(tolerance.lsl, Math.min(tolerance.usl, value)).toFixed(2);
                        }
                    }
                });

                // Fix missing tôle
                if ((!spcDataEntry.tole1 || spcDataEntry.tole1.trim() === '') &&
                    (!spcDataEntry.tole2 || spcDataEntry.tole2.trim() === '') &&
                    (!spcDataEntry.tole3 || spcDataEntry.tole3.trim() === '')) {
                    spcDataEntry.tole1 = `T${Math.floor(Math.random() * 10000)}`;
                }
            }

            saveDataToStorage();
            validateAllData();
            updateDashboard();
            showToast('Entrée corrigée avec succès', 'success');
        }

        // Delete entry by index
        function deleteEntryByIndex(entryIndex) {
            if (confirm('Êtes-vous sûr de vouloir supprimer cette entrée?')) {
                spcData.splice(entryIndex, 1);
                saveDataToStorage();
                validateAllData();
                updateDashboard();
                showToast('Entrée supprimée avec succès', 'success');
            }
        }

        // Clear all data
        function clearAllData() {
            if (confirm('Êtes-vous sûr de vouloir supprimer TOUTES les données? Cette action est irréversible.')) {
                spcData = [];
                saveDataToStorage();
                updateDashboard();
                showToast('Toutes les données ont été supprimées', 'warning');
            }
        }

        // Generate a unique ID
        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }

        // Format date to YYYY-MM-DD
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // Navigate period
        function navigatePeriod(direction) {
            switch (currentPeriodType) {
                case 'week':
                    currentPeriod.setDate(currentPeriod.getDate() + (7 * direction));
                    break;
                case 'month':
                    currentPeriod.setMonth(currentPeriod.getMonth() + direction);
                    break;
                case 'quarter':
                    currentPeriod.setMonth(currentPeriod.getMonth() + (3 * direction));
                    break;
                case 'year':
                    currentPeriod.setFullYear(currentPeriod.getFullYear() + direction);
                    break;
            }

            updatePeriodDisplay();
            loadChartType(currentChartType);
        }

        // Update period display
        function updatePeriodDisplay() {
            let periodStart = new Date(currentPeriod);
            let periodEnd = new Date(currentPeriod);
            let periodText = '';

            switch (currentPeriodType) {
                case 'week':
                    periodStart.setDate(currentPeriod.getDate() - currentPeriod.getDay() + 1); // Monday
                    periodEnd.setDate(periodStart.getDate() + 6); // Sunday
                    periodText = `Semaine du ${formatDateFr(periodStart)} au ${formatDateFr(periodEnd)}`;
                    break;
                case 'month':
                    periodStart.setDate(1); // First day of month
                    periodEnd.setMonth(periodEnd.getMonth() + 1, 0); // Last day of month
                    periodText = `Mois de ${formatDateFr(periodStart, 'monthYear')}`;
                    break;
                case 'quarter':
                    const quarter = Math.floor(periodStart.getMonth() / 3);
                    periodStart.setMonth(quarter * 3, 1); // First day of quarter
                    periodEnd.setMonth((quarter + 1) * 3, 0); // Last day of quarter
                    periodText = `Trimestre ${quarter + 1} (${periodStart.getFullYear()})`;
                    break;
                case 'year':
                    periodStart.setMonth(0, 1); // First day of year
                    periodEnd.setMonth(11, 31); // Last day of year
                    periodText = `Année ${periodStart.getFullYear()}`;
                    break;
            }

            document.getElementById('weekDisplay').textContent = periodText;
        }

        // Format date to French string
        function formatDateFr(date, format = 'full') {
            const options = {
                full: { day: 'numeric', month: 'long', year: 'numeric' },
                monthYear: { month: 'long', year: 'numeric' },
                short: { day: 'numeric', month: 'short' }
            };

            return date.toLocaleDateString('fr-FR', options[format]);
        }

        // Get period dates
        function getPeriodDates(date) {
            const dates = [];
            let periodStart = new Date(date);
            let periodEnd = new Date(date);
            let daysCount = 7;

            switch (currentPeriodType) {
                case 'week':
                    periodStart.setDate(date.getDate() - date.getDay() + 1); // Monday
                    periodEnd.setDate(periodStart.getDate() + 6); // Sunday
                    daysCount = 7;
                    break;
                case 'month':
                    periodStart.setDate(1); // First day of month
                    periodEnd.setMonth(periodEnd.getMonth() + 1, 0); // Last day of month
                    daysCount = periodEnd.getDate();
                    break;
                case 'quarter':
                    const quarter = Math.floor(periodStart.getMonth() / 3);
                    periodStart.setMonth(quarter * 3, 1); // First day of quarter
                    periodEnd.setMonth((quarter + 1) * 3, 0); // Last day of quarter
                    daysCount = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
                    break;
                case 'year':
                    periodStart.setMonth(0, 1); // First day of year
                    periodEnd.setMonth(11, 31); // Last day of year
                    daysCount = 365;
                    break;
            }

            // For performance reasons, limit the number of points for longer periods
            if (currentPeriodType === 'quarter' || currentPeriodType === 'year') {
                // Sample data points (e.g., weekly for quarter, monthly for year)
                const step = currentPeriodType === 'quarter' ? 7 : 30;
                for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + step)) {
                    dates.push(formatDate(new Date(d)));
                }
            } else {
                // For week and month, include all days
                for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
                    dates.push(formatDate(new Date(d)));
                }
            }

            return dates;
        }

        // Save form data
        function saveFormData() {
            const date = document.getElementById('date').value;
            const poste = document.getElementById('poste').value;
            const equipe = document.getElementById('equipe').value;
            const spcSelection = document.querySelector('input[name="spcSelection"]:checked').value;

            // Find existing entry or create new one
            let entry = spcData.find(e => e.date === date && e.poste === poste && e.equipe === equipe);

            if (!entry) {
                entry = {
                    id: generateId(),
                    date: date,
                    poste: poste,
                    equipe: equipe,
                    spc1: null,
                    spc2: null,
                    spc3: null
                };
                spcData.push(entry);
            }

            // Update the selected SPC data
            const spcDataEntry = {
                moyLmLv: document.getElementById('moyLmLv').value,
                etdLmLv: document.getElementById('etdLmLv').value,
                moyLdLr: document.getElementById('moyLdLr').value,
                etdLdLr: document.getElementById('etdLdLr').value,
                moyLargeur: document.getElementById('moyLargeur').value,
                etdLargeur: document.getElementById('etdLargeur').value,
                tole1: document.getElementById('tole1').value,
                tole2: document.getElementById('tole2').value,
                tole3: document.getElementById('tole3').value,
                hqt1: document.getElementById('hqt1').value,
                hqt2: document.getElementById('hqt2').value,
                hqt3: document.getElementById('hqt3').value,
                hqp1: document.getElementById('hqp1').value,
                hqp2: document.getElementById('hqp2').value,
                hqp3: document.getElementById('hqp3').value
            };

            entry[`spc${spcSelection}`] = spcDataEntry;

            // Save to localStorage
            saveDataToStorage();

            // Update dashboard
            updateDashboard();

            // Show success message
            showToast('Données enregistrées avec succès', 'success');

            // Clear form
            clearForm();
        }

        // Clear form
        function clearForm() {
            document.getElementById('spcForm').reset();
            document.getElementById('date').valueAsDate = new Date();
        }

        // Delete current entry
        function deleteCurrentEntry() {
            const date = document.getElementById('date').value;
            const poste = document.getElementById('poste').value;
            const equipe = document.getElementById('equipe').value;
            const spcSelection = document.querySelector('input[name="spcSelection"]:checked').value;

            if (!date || !poste || !equipe) {
                showToast('Veuillez sélectionner une date, un poste et une équipe', 'warning');
                return;
            }

            // Find existing entry
            const entryIndex = spcData.findIndex(e => e.date === date && e.poste === poste && e.equipe === equipe);

            if (entryIndex === -1) {
                showToast('Aucune entrée trouvée pour ces critères', 'warning');
                return;
            }

            // Confirm deletion
            if (confirm(`Êtes-vous sûr de vouloir supprimer le SPC ${spcSelection} pour cette entrée ?`)) {
                // Delete the specific SPC or the entire entry if all SPCs are null
                spcData[entryIndex][`spc${spcSelection}`] = null;

                // Check if all SPCs are null
                if (!spcData[entryIndex].spc1 && !spcData[entryIndex].spc2 && !spcData[entryIndex].spc3) {
                    spcData.splice(entryIndex, 1);
                }

                // Save to localStorage
                saveDataToStorage();

                // Update dashboard
                updateDashboard();

                // Show success message
                showToast('Entrée supprimée avec succès', 'success');

                // Clear form
                clearForm();
            }
        }

        // Update dashboard
        function updateDashboard() {
            // Get filter values
            const filterPoste = document.getElementById('filterPoste').value;
            const filterEquipe = document.getElementById('filterEquipe').value;
            const filterDate = document.getElementById('filterDate').value;
            const filterStatus = document.getElementById('filterStatus').value;

            // Validate data first to get fresh error list
            validateAllData();

            // Filter data
            let filteredData = spcData;

            if (filterPoste) {
                filteredData = filteredData.filter(e => e.poste === filterPoste);
            }

            if (filterEquipe) {
                filteredData = filteredData.filter(e => e.equipe === filterEquipe);
            }

            if (filterDate) {
                filteredData = filteredData.filter(e => e.date === filterDate);
            }

            // Apply status filter based on the updated validationErrors list
            if (filterStatus) {
                const errorEntryIds = validationErrors.map(err => err.entry.id);

                filteredData = filteredData.filter(e => {
                    const isComplete = e.spc1 && e.spc2 && e.spc3;
                    const hasErrors = errorEntryIds.includes(e.id);

                    if (filterStatus === 'complete') {
                        return isComplete && !hasErrors;
                    } else if (filterStatus === 'incomplete') {
                        return !isComplete;
                    } else if (filterStatus === 'errors') {
                        return hasErrors;
                    }
                    return true;
                });
            }

            // Update table
            updateDashboardTable(filteredData);

            // Update statistics
            updateStatistics(filteredData);

            // Update filter options
            updateFilterOptions();
        }

        // Update dashboard table
        function updateDashboardTable(data) {
            const tableBody = document.getElementById('dashboardTableBody');
            tableBody.innerHTML = '';

            // Sort data by date (newest first)
            data.sort((a, b) => new Date(b.date) - new Date(a.date));

            data.forEach(entry => {
                const row = document.createElement('tr');

                // Date cell
                const dateCell = document.createElement('td');
                dateCell.textContent = entry.date;
                row.appendChild(dateCell);

                // Poste cell
                const posteCell = document.createElement('td');
                posteCell.textContent = entry.poste;
                row.appendChild(posteCell);

                // Équipe cell
                const equipeCell = document.createElement('td');
                equipeCell.textContent = entry.equipe;
                row.appendChild(equipeCell);

                // SPC status cells
                for (let i = 1; i <= 3; i++) {
                    const spcCell = document.createElement('td');
                    const spcDataEntry = entry[`spc${i}`];

                    if (spcDataEntry) {
                        const indicator = document.createElement('span');
                        indicator.className = 'status-indicator status-green';
                        spcCell.appendChild(indicator);
                        spcCell.appendChild(document.createTextNode('Complet'));
                    } else {
                        const indicator = document.createElement('span');
                        indicator.className = 'status-indicator status-red';
                        spcCell.appendChild(indicator);
                        spcCell.appendChild(document.createTextNode('Incomplet'));
                    }

                    row.appendChild(spcCell);
                }

                // Validation status cell
                const validationCell = document.createElement('td');
                const hasErrors = validationErrors.some(err => err.entry.id === entry.id);
                if (hasErrors) {
                    validationCell.innerHTML = '<span class="badge bg-warning pulse">Erreurs</span>';
                } else {
                    validationCell.innerHTML = '<span class="badge bg-success">Valide</span>';
                }
                row.appendChild(validationCell);

                // Actions cell
                const actionsCell = document.createElement('td');
                const editButton = document.createElement('button');
                editButton.className = 'btn btn-sm btn-primary me-1';
                editButton.innerHTML = '<i class="bi bi-pencil"></i>';
                editButton.addEventListener('click', function() {
                    loadEntryToForm(entry);
                });
                actionsCell.appendChild(editButton);
                row.appendChild(actionsCell);

                tableBody.appendChild(row);
            });

            // If no data, show a message
            if (data.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 8;
                cell.className = 'text-center';
                cell.textContent = 'Aucune donnée trouvée';
                row.appendChild(cell);
                tableBody.appendChild(row);
            }
        }

        // Update statistics
        function updateStatistics(data) {
            let totalEntries = data.length;
            let completeSPC = 0;
            let incompleteSPC = 0;
            let errorCount = new Set(validationErrors.map(err => err.entry.id)).size; // Unique entries with errors

            data.forEach(entry => {
                for (let i = 1; i <= 3; i++) {
                    if (entry[`spc${i}`]) {
                        completeSPC++;
                    } else {
                        incompleteSPC++;
                    }
                }
            });

            const totalSPC = completeSPC + incompleteSPC;
            const completionRate = totalSPC > 0 ? Math.round((completeSPC / totalSPC) * 100) : 0;

            document.getElementById('totalReleves').textContent = totalEntries;
            document.getElementById('spcComplets').textContent = completeSPC;
            document.getElementById('spcIncomplets').textContent = incompleteSPC;
            document.getElementById('validationErrors').textContent = errorCount;
        }

        // Update filter options
        function updateFilterOptions() {
            // Get unique postes
            const postes = [...new Set(spcData.map(e => e.poste))].sort();
            const filterPoste = document.getElementById('filterPoste');
            const currentPosteValue = filterPoste.value;

            filterPoste.innerHTML = '<option value="">Tous les postes</option>';
            postes.forEach(poste => {
                const option = document.createElement('option');
                option.value = poste;
                option.textContent = poste;
                filterPoste.appendChild(option);
            });
            filterPoste.value = currentPosteValue;

            // Get unique équipes
            const equipes = [...new Set(spcData.map(e => e.equipe))].sort();
            const filterEquipe = document.getElementById('filterEquipe');
            const currentEquipeValue = filterEquipe.value;

            filterEquipe.innerHTML = '<option value="">Toutes les équipes</option>';
            equipes.forEach(equipe => {
                const option = document.createElement('option');
                option.value = equipe;
                option.textContent = `Équipe ${equipe}`;
                filterEquipe.appendChild(option);
            });
            filterEquipe.value = currentEquipeValue;
        }

        // Load entry to form
        function loadEntryToForm(entry) {
            document.getElementById('date').value = entry.date;
            document.getElementById('poste').value = entry.poste;
            document.getElementById('equipe').value = entry.equipe;

            // Switch to saisie page
            showPage('saisie');
            document.querySelector('[data-page="saisie"]').classList.add('active');
            document.querySelector('[data-page="dashboard"]').classList.remove('active');

            // Find first available SPC with data
            for (let i = 1; i <= 3; i++) {
                if (entry[`spc${i}`]) {
                    document.getElementById(`spc${i}`).checked = true;
                    loadSpcToForm(entry[`spc${i}`]);
                    break;
                }
            }
        }

        // Load SPC data to form
        function loadSpcToForm(spcDataEntry) {
            document.getElementById('moyLmLv').value = spcDataEntry.moyLmLv || '';
            document.getElementById('etdLmLv').value = spcDataEntry.etdLmLv || '';
            document.getElementById('moyLdLr').value = spcDataEntry.moyLdLr || '';
            document.getElementById('etdLdLr').value = spcDataEntry.etdLdLr || '';
            document.getElementById('moyLargeur').value = spcDataEntry.moyLargeur || '';
            document.getElementById('etdLargeur').value = spcDataEntry.etdLargeur || '';
            document.getElementById('tole1').value = spcDataEntry.tole1 || '';
            document.getElementById('tole2').value = spcDataEntry.tole2 || '';
            document.getElementById('tole3').value = spcDataEntry.tole3 || '';
            document.getElementById('hqt1').value = spcDataEntry.hqt1 || '';
            document.getElementById('hqt2').value = spcDataEntry.hqt2 || '';
            document.getElementById('hqt3').value = spcDataEntry.hqt3 || '';
            document.getElementById('hqp1').value = spcDataEntry.hqp1 || '';
            document.getElementById('hqp2').value = spcDataEntry.hqp2 || '';
            document.getElementById('hqp3').value = spcDataEntry.hqp3 || '';
        }

        // Load chart type (MODIFIED to work synchronously for card view data)
        function loadChartType(chartType, advancedFilters = null) {
            currentChartType = chartType;

            // Show loading spinner
            document.getElementById('chartLoading').classList.add('active');
            document.getElementById('chartContent').innerHTML = '';

            // Update chart title
            let chartTitle = '';
            switch (chartType) {
                case 'lm-lv':
                    chartTitle = 'Graphiques Lm-Lv';
                    break;
                case 'ld-lr':
                    chartTitle = 'Graphiques Ld-Lr';
                    break;
                case 'largeur':
                    chartTitle = 'Graphiques Largeur';
                    break;
                case 'hqt-hqp':
                    chartTitle = 'Graphiques HQT-HQP';
                    break;
            }
            document.getElementById('chartTitle').textContent = chartTitle;

            // Get period dates
            const periodDates = getPeriodDates(currentPeriod);

            // Get filter values
            const filterEquipe = document.getElementById('chartEquipeFilter').value;

            // Destroy existing charts
            Object.values(charts).forEach(chart => {
                if (chart) chart.destroy();
            });
            charts = {};

            // Clear current point details
            updateInteractiveLegend(null);

            // Update dynamic legend colors
            updateLegendColors();

            // Create chart content based on type
            setTimeout(() => {
                document.getElementById('chartLoading').classList.remove('active');

                let allDataPoints = []; // To collect data points for card view

                // Note: filterPoste is ignored as we show all 3 shifts
                if (filterEquipe) {
                    // Filtered view: One tab for the selected team
                    if (chartType === 'hqt-hqp') {
                         document.getElementById('chartContent').innerHTML = '<p class="alert alert-warning">Les graphiques HQT-HQP sont en cours d\'implémentation pour l\'affichage filtré par équipe.</p>';
                         document.getElementById('chartLegendContainer').classList.add('hidden'); // Hide legend for Bar charts
                    } else {
                         // Capture data points from line chart creation
                         const data = createLineCharts(chartType, periodDates, filterEquipe, advancedFilters);
                         allDataPoints = data.dataPoints.flat().filter(p => p !== null);
                         document.getElementById('chartLegendContainer').classList.remove('hidden'); // Show legend for Line charts
                    }
                } else {
                    // No filter view: One tab showing the average of all teams
                    if (chartType === 'hqt-hqp') {
                         document.getElementById('chartContent').innerHTML = '<p class="alert alert-warning">Les graphiques HQT-HQP sont en cours d\'implémentation pour l\'affichage en moyenne.</p>';
                         document.getElementById('chartLegendContainer').classList.add('hidden'); // Hide legend for Bar charts
                    } else {
                         // Capture data points from line chart creation
                         const data = createLineCharts(chartType, periodDates, null, advancedFilters);
                         allDataPoints = data.dataPoints.flat().filter(p => p !== null);
                         document.getElementById('chartLegendContainer').classList.remove('hidden'); // Show legend for Line charts
                    }
                }

                // NEW: Load card view if selected and data is available for it
                if (currentViewMode === 'card') {
                    if (chartType === 'hqt-hqp') {
                        document.getElementById('cardsRow').innerHTML = '<div class="col-12"><p class="alert alert-warning">L\'affichage "Vue Fiches" n\'est pas supporté pour les graphiques HQT/HQP. Veuillez utiliser "Vue Tableau" ou "Vue Classique".</p></div>';
                    } else {
                        loadCardView(allDataPoints);
                    }
                }

            }, 500);
        }

        // Helper function to update the legend color dots (NEW FUNCTION)
        function updateLegendColors() {
            document.getElementById('legend_spc1').querySelector('.color-dot').style.backgroundColor = spcSettings.customColors.spc1;
            document.getElementById('legend_spc2').querySelector('.color-dot').style.backgroundColor = spcSettings.customColors.spc2;
            document.getElementById('legend_spc3').querySelector('.color-dot').style.backgroundColor = spcSettings.customColors.spc3;
            document.getElementById('legend_oot').querySelector('.color-dot').style.backgroundColor = spcSettings.customColors.outOfToleranceDot;
            document.getElementById('legend_oot').querySelector('.color-dot').style.borderColor = spcSettings.customColors.outOfToleranceDot;
        }

        // Helper function to create tabs
        function createTab(tabNav, tabContent, title, id, isActive, chart1IdPrefix, chart2IdPrefix) {
            // Create tab
            const tab = document.createElement('li');
            tab.className = 'nav-item';

            const tabLink = document.createElement('a');
            tabLink.className = `nav-link ${isActive ? 'active' : ''}`;
            tabLink.setAttribute('data-bs-toggle', 'tab');
            tabLink.href = `#tab-${id}`;
            tabLink.textContent = title;

            tab.appendChild(tabLink);
            tabNav.appendChild(tab);

            // Create tab content
            const tabPane = document.createElement('div');
            tabPane.className = `tab-pane fade ${isActive ? 'show active' : ''}`;
            tabPane.id = `tab-${id}`;

            // Create chart containers using the provided prefixes
            const chart1Container = document.createElement('div');
            chart1Container.className = 'chart-container';
            chart1Container.innerHTML = `<canvas id="${chart1IdPrefix}-${id}"></canvas>`;

            const chart2Container = document.createElement('div');
            chart2Container.className = 'chart-container';
            chart2Container.innerHTML = `<canvas id="${chart2IdPrefix}-${id}"></canvas>`;

            tabPane.appendChild(chart1Container);
            tabPane.appendChild(chart2Container);
            tabContent.appendChild(tabPane);
        }

        // Create line charts (MODIFIED to return all data points)
        function createLineCharts(metricType, periodDates, filterEquipe, advancedFilters = null) {
            const chartContent = document.getElementById('chartContent');

            // Determine the field names based on metricType
            let moyField, etdField, titleMoy, titleEtd;

            switch (metricType) {
                case 'lm-lv':
                    moyField = 'moyLmLv'; etdField = 'etdLmLv'; titleMoy = 'Moyenne Lm-Lv'; titleEtd = 'Étendue Lm-Lv';
                    break;
                case 'ld-lr':
                    moyField = 'moyLdLr'; etdField = 'etdLdLr'; titleMoy = 'Moyenne Ld-Lr'; titleEtd = 'Étendue Ld-Lr';
                    break;
                case 'largeur':
                    moyField = 'moyLargeur'; etdField = 'etdLargeur'; titleMoy = 'Moyenne Largeur'; titleEtd = 'Étendue Largeur';
                    break;
            }

            // Get tolerance min/max for chart scale
            const tolMoy = spcSettings[moyField] || DEFAULT_SETTINGS[moyField];
            const tolEtd = spcSettings[etdField] || DEFAULT_SETTINGS[etdField];

            const minY_Moy = tolMoy.lsl - 5;
            const maxY_Moy = tolMoy.usl + 5;
            const minY_Etd = 0;
            const maxY_Etd = tolEtd.usl + 5;

            // Create tabs (only one tab if filtered, or one main "average" tab if not filtered)
            const tabNav = document.createElement('ul');
            tabNav.className = 'nav nav-tabs chart-tabs';

            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';

            let tabId = filterEquipe ? `equipe-${filterEquipe}` : 'toutes-equipes';
            let tabTitle = filterEquipe ? `Équipe ${filterEquipe}` : 'Toutes les équipes';

            createTab(tabNav, tabContent, tabTitle, tabId, true, 'moy', 'etd');

            chartContent.appendChild(tabNav);
            chartContent.appendChild(tabContent);

            // Create charts for the tab and collect data points
            let moyDataPoints, etdDataPoints;

            if (filterEquipe) {
                moyDataPoints = createContinuousLineChart(`moy-${tabId}`, titleMoy, periodDates, filterEquipe, moyField, minY_Moy, maxY_Moy, advancedFilters);
                etdDataPoints = createContinuousLineChart(`etd-${tabId}`, titleEtd, periodDates, filterEquipe, etdField, minY_Etd, maxY_Etd, advancedFilters);
            } else {
                moyDataPoints = createContinuousLineChart(`moy-${tabId}`, titleMoy, periodDates, null, moyField, minY_Moy, maxY_Moy, advancedFilters);
                etdDataPoints = createContinuousLineChart(`etd-${tabId}`, titleEtd, periodDates, null, etdField, minY_Etd, maxY_Etd, advancedFilters);
            }

            return { dataPoints: [moyDataPoints, etdDataPoints] };
        }

        // NOUVEAU: Fonction pour générer les annotations d'arrière-plan par poste/shift
        function getShiftBackgroundAnnotations(labels, settings) {
            const annotations = {};
            const shiftColors = settings.shiftColors;

            labels.forEach((label, index) => {
                // Le label est au format D-S-SPC# (e.g., 28-M-1)
                const shiftInitial = label.split('-')[1]; // M, A, or N
                let color;

                if (index % 3 === 0) { // Ne créer l'annotation que pour le premier point de chaque bloc de 3
                    if (shiftInitial === 'M') {
                        color = shiftColors.matin;
                    } else if (shiftInitial === 'A') {
                        color = shiftColors.apresMidi;
                    } else if (shiftInitial === 'N') {
                        color = shiftColors.nuit;
                    } else {
                        return; // Skip if unknown
                    }

                    // Le bloc couvre les 3 points du SPC (SPC1, SPC2, SPC3)
                    // xMin: index - 0.5 (avant le premier point), xMax: index + 2.5 (après le dernier point)
                    const boxId = `shift-bg-${index}`;
                    annotations[boxId] = {
                        type: 'box',
                        xMin: index - 0.5,
                        xMax: index + 2.5,
                        yMin: 'min',
                        yMax: 'max',
                        backgroundColor: color,
                        borderWidth: 0,
                        // CORRIGÉ: z-index négatif pour s'assurer que le fond est derrière les données
                        z: -10,
                        label: { // Label affichant le Poste (M/A/N) pour la visibilité
                            content: shiftInitial,
                            enabled: true,
                            position: 'start',
                            yAdjust: 10,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            font: { size: 10, weight: 'bold' }
                        }
                    };
                }
            });
            return annotations;
        }

        // Crée un graphique linéaire continu avec connexion chronologique réelle (MODIFIÉ)
        function createContinuousLineChart(canvasId, title, periodDates, filterEquipe, field, minY, maxY, advancedFilters = null) {
            const ctx = document.getElementById(canvasId).getContext('2d');

            const colors = spcSettings.customColors;
            const chartConfig = spcSettings.chartCustomization; // NOUVEAU: Récupérer la config visuelle
            const labels = [];
            const dataPoints = [];
            const pointColors = [];

            // Créer une série continue de points dans l'ordre chronologique
            periodDates.forEach(date => {
                SHIFTS.forEach(shift => {
                    for (let spc = 1; spc <= 3; spc++) {
                        // NOUVEAU: Simplification du label de l'axe X
                        const datePart = date.substring(8); // Jour (DD)
                        const shiftInitial = shift.substring(0, 1); // M, A, or N
                        const label = `${datePart}-${shiftInitial}-${spc}`; // D-S-SPC#
                        labels.push(label);

                        let value = null;
                        let dataPoint = null;

                        // --- Data Retrieval Logic ---
                        if (filterEquipe) {
                            const entry = spcData.find(e =>
                                e.date === date &&
                                e.poste === shift &&
                                e.equipe === filterEquipe &&
                                e[`spc${spc}`]
                            );

                            if (entry && entry[`spc${spc}`] && entry[`spc${spc}`][field]) {
                                value = parseFloat(entry[`spc${spc}`][field]);
                                dataPoint = {
                                    date: date,
                                    poste: shift,
                                    equipe: filterEquipe,
                                    spc: spc,
                                    value: value,
                                    entry: entry
                                };
                            }
                        } else {
                            const entries = spcData.filter(e =>
                                e.date === date &&
                                e.poste === shift &&
                                e[`spc${spc}`] &&
                                e[`spc${spc}`][field]
                            );

                            if (entries.length > 0) {
                                let values = entries.map(e => parseFloat(e[`spc${spc}`][field])).filter(v => !isNaN(v));

                                if (values.length > 0) {
                                    value = values.reduce((a, b) => a + b, 0) / values.length;
                                    value = parseFloat(value.toFixed(2));

                                    dataPoint = {
                                        date: date,
                                        poste: shift,
                                        spc: spc,
                                        value: value,
                                        entries: entries
                                    };
                                }
                            }
                        }

                        // --- Advanced Filter Application ---
                        if (dataPoint && advancedFilters) {
                            let passFilter = true;
                            if (advancedFilters.minValue !== null && value < advancedFilters.minValue) passFilter = false;
                            if (advancedFilters.maxValue !== null && value > advancedFilters.maxValue) passFilter = false;
                            if (advancedFilters.outlierFilter === 'hide' && isOutlier(value, dataPoints.map(p => p ? p.value : null))) passFilter = false;

                            if (!passFilter) {
                                value = null;
                                dataPoint = null;
                            }
                        }

                        dataPoints.push(dataPoint);

                        // --- Point Color Logic (for chart visual) ---
                        let pointColor = null;
                        if (value !== null) {
                            pointColor = colors[`spc${spc}`]; // Color by custom SPC color
                            const tolerance = spcSettings[field] || {};
                            if (value < tolerance.lsl || value > tolerance.usl) {
                                pointColor = colors.outOfToleranceDot; // Override to custom OOT color
                            }
                        }

                        pointColors.push(pointColor);

                        // Add the field name to data points for card view/details differentiation
                        if (dataPoint) dataPoint.field = field;
                    }
                });
            });

            // Apply smoothing if requested
            let smoothedData = dataPoints.map(p => p ? p.value : null);
            if (advancedFilters && advancedFilters.smoothingFilter !== 'none') {
                const smoothingFactor = advancedFilters.smoothingFilter === 'light' ? 0.3 :
                                       advancedFilters.smoothingFilter === 'medium' ? 0.5 : 0.7;
                smoothedData = applySmoothing(smoothedData, smoothingFactor);
            }

            // Create the dataset
            const dataset = {
                label: filterEquipe ? `Équipe ${filterEquipe}` : 'Moyenne Équipes',
                data: smoothedData,
                // Ligne de connexion: utilise la couleur personnalisée
                borderColor: spcSettings.customColors.line,
                backgroundColor: spcSettings.customColors.line.replace('0.6', '0.2'), // Utilise une transparence du même bleu
                tension: 0.1,
                spanGaps: true,
                pointRadius: chartConfig.pointRadius,       // NOUVEAU: Taille du point personnalisée
                pointHoverRadius: chartConfig.pointHoverRadius, // NOUVEAU: Taille au survol personnalisée
                borderWidth: 2,
                pointBackgroundColor: pointColors, // Couleur des points par SPC / Hors Tolérance
                pointBorderColor: pointColors,
                dataPoints: dataPoints
            };

            // Add trend line if requested
            const datasets = [dataset];
            if (advancedFilters && advancedFilters.trendLineFilter !== 'none') {
                const trendData = calculateTrendLine(smoothedData, advancedFilters.trendLineFilter);

                datasets.push({
                    label: 'Tendance',
                    data: trendData,
                    borderColor: spcSettings.customColors.trendLine, // Couleur personnalisée
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    borderWidth: 2,
                    fill: false
                });
            }

            // NOUVEAU: Combinez les annotations de Tolérance et de Poste
            const toleranceAnnotations = getToleranceAnnotations(field, spcSettings).annotations;
            // CORRIGÉ: Ajoute les annotations d'arrière-plan du poste UNIQUEMENT si l'équipe n'est pas filtrée
            const shiftAnnotations = filterEquipe ? {} : getShiftBackgroundAnnotations(labels, spcSettings);
            const allAnnotations = { ...toleranceAnnotations, ...shiftAnnotations };

            // Create chart with zoom plugin
            charts[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    // Interagit uniquement avec l'index (point unique)
                    interaction: {
                        mode: 'nearest',
                        intersect: true,
                        axis: 'x'
                    },
                    onHover: (event, elements) => {
                        console.log("onHover event triggered");
                        if (currentViewMode === 'classic') {
                            // Assurez-vous que le dataset est bien celui des points (le premier)
                            const pointElement = elements.find(el => el.datasetIndex === 0);
                            if (pointElement) {
                                console.log("Data point found on hover");
                                const index = pointElement.index;
                                const dataPoint = dataset.dataPoints[index];
                                updateInteractiveLegend(dataPoint); // Mise à jour de la légende
                            } else {
                                console.log("No data point found on hover");
                                updateInteractiveLegend(null);
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `${title} ${filterEquipe ? `(Équipe ${filterEquipe})` : '(toutes les Équipes)'}`
                        },
                        legend: {
                            display: false // Supprimer la légende par défaut pour utiliser l'élément personnalisé
                        },
                        tooltip: {
                            callbacks: {
                                // Rendre le tooltip plus simple car les détails sont en bas
                                label: function(context) {
                                    const dataPoint = dataset.dataPoints[context.dataIndex];
                                    if (dataPoint) {
                                        return `${context.dataset.label}: ${dataPoint.value.toFixed(2)}`;
                                    }
                                    return '';
                                },
                                afterLabel: function(context) {
                                    const dataPoint = dataset.dataPoints[context.dataIndex];
                                    if (dataPoint) {
                                        return `Poste: ${dataPoint.poste.substring(0, 1)} / SPC: ${dataPoint.spc}`;
                                    }
                                    return '';
                                },
                                title: function(context) {
                                    // Affiche la date et le shift complets dans le titre du tooltip
                                    const index = context[0].dataIndex;
                                    const fullLabel = labels[index];
                                    const datePart = fullLabel.split('-')[0];
                                    const shiftPart = fullLabel.split('-')[1];
                                    // Trouvez le nom complet du poste
                                    const fullShiftName = SHIFTS.find(s => s.startsWith(shiftPart));
                                    return `Date: ${datePart} - Poste: ${fullShiftName || shiftPart}`;
                                }
                            }
                        },
                        // UTILISEZ LES ANNOTATIONS COMBINÉES
                        annotation: { annotations: allAnnotations },
                        zoom: {
                            zoom: {
                                wheel: {
                                    enabled: true,
                                },
                                pinch: {
                                    enabled: true
                                },
                                mode: 'x',
                            },
                            pan: {
                                enabled: isPanMode,
                                mode: 'x',
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: minY,
                            max: maxY
                        },
                        x: {
                            ticks: {
                                maxRotation: 90,
                                minRotation: 90,
                                autoSkip: true,
                                maxTicksLimit: chartConfig.maxXTicksLimit // NOUVEAU: Limite de ticks personnalisée
                            }
                        }
                    },
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const pointElement = elements.find(el => el.datasetIndex === 0); // Assurez-vous que c'est le point de données et non la ligne de tendance
                            if (pointElement) {
                                const index = pointElement.index;
                                const dataPoint = dataset.dataPoints[index];

                                if (dataPoint) {
                                    if (filterEquipe) {
                                        showDataPointDetails(dataPoint);
                                    } else {
                                        // Show details for the first entry in the average
                                        showDataPointDetails({
                                            ...dataPoint.entries[0],
                                            value: dataPoint.value
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            });

            return dataPoints;
        }

        // NOUVEAU: Fonction pour mettre à jour la légende interactive/détails du point
        function updateInteractiveLegend(dataPoint) {
            const detailsContainer = document.getElementById('currentPointDetails');

            if (dataPoint) {
                const spc = dataPoint.spc;
                const field = dataPoint.field;
                const tolerance = spcSettings[field] || {};
                const isOutOfTolerance = dataPoint.value < tolerance.lsl || dataPoint.value > tolerance.usl;
                const valueColor = isOutOfTolerance ? 'text-danger fw-bold' : 'text-success fw-bold';

                // Formater la date et le poste pour la lisibilité
                const dateParts = dataPoint.date.split('-');
                const formattedDate = `${dateParts[2]}/${dateParts[1]}`;
                const shiftInitial = dataPoint.poste.substring(0, 1);

                let detailsHtml = `
                    <h6 class="mb-1">Point de Mesure: ${formattedDate} (${shiftInitial}) - SPC${spc}</h6>
                    <div class="d-flex flex-wrap gap-3">
                        <p class="mb-0"><strong>Équipe:</strong> ${dataPoint.equipe || 'Moyenne'}</p>
                        <p class="mb-0"><strong>Métrique:</strong> ${field}</p>
                        <p class="mb-0"><strong>Valeur:</strong> <span class="${valueColor}">${dataPoint.value.toFixed(2)}</span></p>
                        <p class="mb-0"><strong>Statut:</strong> <span class="${isOutOfTolerance ? 'text-danger fw-bold' : 'text-success fw-bold'}">${isOutOfTolerance ? 'Hors Tolérance' : 'Conforme'}</span></p>
                    </div>
                    <p class="mb-0 mt-2"><button class="btn btn-sm btn-outline-primary" id="legendDetailsButton"><i class="bi bi-info-circle"></i> Détails complets</button></p>
                `;
                detailsContainer.classList.add('active');
                detailsContainer.innerHTML = detailsHtml;

                document.getElementById('legendDetailsButton').addEventListener('click', () => {
                    if (dataPoint.equipe) {
                        showDataPointDetails(dataPoint);
                    } else {
                        // Handle average data point
                        showDataPointDetails({
                            ...dataPoint.entries[0],
                            value: dataPoint.value
                        });
                    }
                });
            } else {
                detailsContainer.classList.remove('active');
                detailsContainer.innerHTML = '<p class="mb-0 text-secondary"><i class="bi bi-info-circle"></i> Survolez un point pour afficher ses détails.</p>';
            }
        }

        // NOUVEAU: Fonction pour générer les annotations Chart.js
        function getToleranceAnnotations(field, settings) {
            const annotations = {};
            const tolerance = settings[field];
            const colors = settings.customColors;

            // Seulement pour les champs qui ont une tolérance définie dans DEFAULT_SETTINGS
            if (!tolerance || !DEFAULT_SETTINGS[field]) return { annotations: {} };

            const usl = parseFloat(tolerance.usl);
            const lsl = parseFloat(tolerance.lsl);

            // Annotation Zone Supérieure (achurée/ombrée)
            if (!isNaN(usl)) {
                annotations.uslZone = {
                    type: 'box',
                    yMin: usl,
                    yMax: 99999, // Au-dessus de l'USL
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 0,
                    z: -1
                };
                // Annotation Ligne USL
                annotations.uslLine = {
                    type: 'line',
                    yMin: usl,
                    yMax: usl,
                    borderColor: colors.toleranceLine,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        enabled: true,
                        content: `USL: ${usl.toFixed(2)}`,
                        position: 'start',
                        backgroundColor: colors.toleranceLine,
                        color: 'white'
                    }
                };
            }

            // Annotation Zone Inférieure (achurée/ombrée)
            if (!isNaN(lsl)) {
                annotations.lslZone = {
                    type: 'box',
                    yMin: -99999, // En dessous de la LSL
                    yMax: lsl,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 0,
                    z: -1
                };
                // Annotation Ligne LSL
                annotations.lslLine = {
                    type: 'line',
                    yMin: lsl,
                    yMax: lsl,
                    borderColor: colors.toleranceLine,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        enabled: true,
                        content: `LSL: ${lsl.toFixed(2)}`,
                        position: 'start',
                        backgroundColor: colors.toleranceLine,
                        color: 'white'
                    }
                };
            }

            return { annotations: annotations };
        }

        // Create bar charts (MODIFIED: Simplified color array to use spcSettings)
        function createBarCharts(periodDates, filterEquipe, advancedFilters = null) {
            // Note: Cette fonction nécessite une refonte pour supporter le nouveau modèle de données HQT/HQP
            document.getElementById('chartContent').innerHTML = '<p class="alert alert-danger">Fonction de graphique à barres non implémentée (HQT/HQP).</p>';
        }

        // Helper function to check if a value is an outlier
        function isOutlier(value, data) {
            if (!value || !data || data.length < 3) return false;

            const validValues = data.filter(v => v !== null);
            if (validValues.length < 3) return false;

            // Calculate Q1 and Q3
            const sorted = [...validValues].sort((a, b) => a - b);
            const q1Index = Math.floor(sorted.length * 0.25);
            const q3Index = Math.floor(sorted.length * 0.75);
            const q1 = sorted[q1Index];
            const q3 = sorted[q3Index];
            const iqr = q3 - q1;

            // Define outlier boundaries
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;

            return value < lowerBound || value > upperBound;
        }

        // Helper function to apply smoothing to data
        function applySmoothing(data, factor) {
            if (!data || data.length < 3) return data;

            const smoothed = [...data];
            for (let i = 1; i < smoothed.length - 1; i++) {
                if (smoothed[i] !== null && smoothed[i-1] !== null && smoothed[i+1] !== null) {
                    smoothed[i] = smoothed[i] * (1 - factor) +
                                 (smoothed[i-1] + smoothed[i+1]) / 2 * factor;
                }
            }
            return smoothed;
        }

        // Helper function to calculate trend line
        function calculateTrendLine(data, type) {
            if (!data || data.length < 2) return data;

            const validData = data.map((v, i) => ({ x: i, y: v })).filter(p => p.y !== null);
            if (validData.length < 2) return data;

            let trendData = [];

            if (type === 'linear') {
                // Calculate linear regression
                const n = validData.length;
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

                validData.forEach(point => {
                    sumX += point.x;
                    sumY += point.y;
                    sumXY += point.x * point.y;
                    sumX2 += point.x * point.x;
                });

                const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;

                // Generate trend line data
                for (let i = 0; i < data.length; i++) {
                    trendData.push(slope * i + intercept);
                }
            } else if (type === 'polynomial') {
                // Calculate polynomial regression (degree 2)
                const n = validData.length;
                let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
                let sumY = 0, sumXY = 0, sumX2Y = 0;

                validData.forEach(point => {
                    const x = point.x;
                    const y = point.y;
                    sumX += x;
                    sumX2 += x * x;
                    sumX3 += x * x * x;
                    sumX4 += x * x * x * x;
                    sumY += y;
                    sumXY += x * y;
                    sumX2Y += x * x * y;
                });

                // Solve the system of equations for a, b, c in y = ax² + bx + c
                const denominator = n * (sumX2 * sumX4 - sumX3 * sumX3) -
                                   sumX * (sumX * sumX4 - sumX2 * sumX3) +
                                   sumX2 * (sumX * sumX3 - sumX2 * sumX2);

                if (Math.abs(denominator) > 0.0001) {
                    const a = (sumY * (sumX2 * sumX4 - sumX3 * sumX3) -
                             sumX * (sumXY * sumX4 - sumX2 * sumX3) +
                             sumX2 * (sumXY * sumX3 - sumX2 * sumX2Y)) / denominator;

                    const b = (n * (sumXY * sumX4 - sumX2 * sumX3) -
                             sumY * (sumX * sumX4 - sumX2 * sumX3) +
                             sumX2 * (sumX * sumX3 - sumX2 * sumX2)) / denominator;

                    const c = (n * (sumX2 * sumX2Y - sumXY * sumX3) -
                             sumX * (sumX * sumX2Y - sumXY * sumX2) +
                             sumY * (sumX * sumX3 - sumX2 * sumX2)) / denominator;

                    // Generate trend line data
                    for (let i = 0; i < data.length; i++) {
                        trendData.push(a * i * i + b * i + c);
                    }
                } else {
                    // Fallback to linear regression if denominator is too small
                    return calculateTrendLine(data, 'linear');
                }
            }

            return trendData;
        }

        // Export data
        function exportData() {
            const dataStr = JSON.stringify(spcData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

            const exportFileDefaultName = `spc_data_${formatDate(new Date())}.json`;

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();

            showToast('Données exportées avec succès', 'success');
        }

        // Import data
        function importData(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const importedData = JSON.parse(event.target.result);

                    if (Array.isArray(importedData)) {
                        spcData = importedData;
                        saveDataToStorage();
                        updateDashboard();
                        showToast('Données importées avec succès', 'success');
                    } else {
                        showToast('Format de fichier invalide', 'danger');
                    }
                } catch (error) {
                    showToast('Erreur lors de l\'importation des données', 'danger');
                    console.error(error);
                }
            };

            reader.readAsText(file);

            // Reset file input
            e.target.value = '';
        }

        // Show toast notification
        function showToast(message, type = 'info') {
            const toastContainer = document.querySelector('.toast-container');

            const toast = document.createElement('div');
            toast.className = `toast custom-toast align-items-center text-white bg-${type} border-0`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('aria-atomic', 'true');

            const toastBody = document.createElement('div');
            toastBody.className = 'd-flex';

            const toastContent = document.createElement('div');
            toastContent.className = 'toast-body';
            toastContent.textContent = message;

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'btn-close btn-close-white me-2 m-auto';
            closeButton.setAttribute('data-bs-dismiss', 'toast');
            closeButton.setAttribute('aria-label', 'Close');

            toastBody.appendChild(toastContent);
            toastBody.appendChild(closeButton);
            toast.appendChild(toastBody);
            toastContainer.appendChild(toast);

            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();

            // Remove toast after it's hidden
            toast.addEventListener('hidden.bs.toast', function() {
                toast.remove();
            });
