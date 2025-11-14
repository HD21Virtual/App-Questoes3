import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.1.3/lit-html.js';
import { state, subscribe } from '../state.js';
import { renderHomePerformanceChart, renderStatsPagePerformanceChart, renderEvolutionChart, renderWeeklyChart } from '../ui/charts.js';
import { fetchPerformanceLog } from '../services/firestore.js';
import DOM from '../dom-elements.js';
import { setupCustomSelect } from './filter.js';

function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function updateStatsPageUI() {
    let totalQuestions = 0;
    let totalCorrect = 0;
    const materiaTotals = {};

    state.historicalSessions.forEach(session => {
        totalQuestions += session.totalQuestions || 0;
        totalCorrect += session.correctCount || 0;
        for (const materia in session.details) {
            if (!materiaTotals[materia]) materiaTotals[materia] = { correct: 0, total: 0 };
            materiaTotals[materia].correct += session.details[materia].correct || 0;
            materiaTotals[materia].total += session.details[materia].total || 0;
        }
    });

    state.sessionStats.forEach(stat => {
        totalQuestions += 1;
        if (stat.isCorrect) {
            totalCorrect += 1;
        }
        if (!materiaTotals[stat.materia]) {
            materiaTotals[stat.materia] = { correct: 0, total: 0 };
        }
        materiaTotals[stat.materia].total += 1;
        if (stat.isCorrect) {
            materiaTotals[stat.materia].correct += 1;
        }
    });

    if (DOM.statsTotalQuestionsEl) DOM.statsTotalQuestionsEl.textContent = totalQuestions;
    if (DOM.statsTotalCorrectEl) DOM.statsTotalCorrectEl.textContent = totalCorrect;
    if (DOM.statsTotalIncorrectEl) DOM.statsTotalIncorrectEl.textContent = totalQuestions - totalCorrect;
    const geralAccuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(0) : 0;
    if (DOM.statsGeralAccuracyEl) DOM.statsGeralAccuracyEl.textContent = `${geralAccuracy}%`;

    renderHomePerformanceChart(materiaTotals);
    renderWeeklyChart();
}

function updateStatsAssuntoFilterCustom(disciplinas) {
    const assuntoContainer = DOM.statsAssuntoFilterCustom;
    if (!assuntoContainer) return;

    const assuntoButton = assuntoContainer.querySelector('.custom-select-button');
    const valueSpan = assuntoContainer.querySelector('.custom-select-value');
    const optionsContainer = assuntoContainer.querySelector('.custom-select-options');

    valueSpan.textContent = 'Todos';
    valueSpan.classList.add('text-gray-500');
    assuntoContainer.dataset.value = '[]';
    optionsContainer.innerHTML = '';

    if (disciplinas.length === 0) {
        assuntoButton.disabled = true;
        optionsContainer.innerHTML = `<div class="p-2 text-center text-gray-400 text-sm">Selecione uma matéria</div>`;
    } else {
        assuntoButton.disabled = false;

        let newHtml = `
            <label class="flex items-center space-x-2 p-1 rounded-md hover:bg-gray-100 cursor-pointer font-bold border-b pb-2 mb-1">
                <input type="checkbox" data-type="select-all-assuntos" class="custom-select-option rounded">
                <span>Selecionar tudo</span>
            </label>
        `;

        disciplinas.forEach(disciplinaName => {
            const materiaObj = state.filterOptions.materia.find(m => m.name === disciplinaName);
            if (materiaObj && materiaObj.assuntos.length > 0) {
                newHtml += `<div class="font-bold text-sm text-gray-700 mt-2 px-1">${materiaObj.name}</div>`;

                materiaObj.assuntos.forEach(assunto => {
                    const hasSubAssuntos = assunto.subAssuntos && assunto.subAssuntos.length > 0;
                    newHtml += `
                        <div class="assunto-group">
                            <div class="flex items-center p-1 rounded-lg hover:bg-gray-100">
                                ${hasSubAssuntos ?
                                    `<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200 assunto-toggle"></i>` :
                                    `<span class="w-6 mr-2"></span>`
                                }
                                <label class="flex-grow flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" data-value="${assunto.name}" data-type="assunto" class="custom-select-option rounded">
                                    <span>${assunto.name}</span>
                                </label>
                            </div>
                    `;

                    if (hasSubAssuntos) {
                        newHtml += `<div class="sub-assunto-list pl-6 mt-1 space-y-1 hidden">`;
                        assunto.subAssuntos.forEach(subAssunto => {
                            const hasSubSubAssuntos = subAssunto.subSubAssuntos && subAssunto.subSubAssuntos.length > 0;
                            newHtml += `
                                <div class="sub-assunto-group">
                                    <div class="flex items-center p-1 rounded-lg hover:bg-gray-100">
                                        ${hasSubSubAssuntos ?
                                            `<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200 assunto-toggle"></i>` :
                                            `<span class="w-6 mr-2"></span>`
                                        }
                                        <label class="flex-grow flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" data-value="${subAssunto.name}" data-parent-assunto="${assunto.name}" data-type="subassunto" class="custom-select-option rounded">
                                            <span>${subAssunto.name}</span>
                                        </label>
                                    </div>
                            `;

                            if (hasSubSubAssuntos) {
                                newHtml += `<div class="sub-sub-assunto-list pl-6 mt-1 space-y-1 hidden">`;
                                subAssunto.subSubAssuntos.forEach(subSubAssunto => {
                                    newHtml += `
                                        <label class="flex items-center space-x-2 p-1 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" data-value="${subSubAssunto}" data-parent-assunto="${assunto.name}" data-parent-subassunto="${subAssunto.name}" data-type="subsubassunto" class="custom-select-option rounded">
                                            <span>${subSubAssunto}</span>
                                        </label>
                                    `;
                                });
                                newHtml += `</div>`;
                            }
                            newHtml += `</div>`;
                        });
                        newHtml += `</div>`;
                    }
                    newHtml += `</div>`;
                });
            }
        });

        optionsContainer.innerHTML = newHtml;

        optionsContainer.querySelectorAll('.assunto-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const list = e.target.closest('.assunto-group, .sub-assunto-group').querySelector('.sub-assunto-list, .sub-sub-assunto-list');
                if (list) {
                    list.classList.toggle('hidden');
                    e.target.classList.toggle('rotate-90');
                }
            });
        });
    }
}

function populateStatsFilters() {
    if (!DOM.statsMateriaFilterCustom || !DOM.statsAssuntoFilterCustom) return;

    const materiaContainer = DOM.statsMateriaFilterCustom.querySelector('.custom-select-options');
    if (materiaContainer) {
        const materias = state.filterOptions.materia.map(m => m.name).sort(naturalSort);

        const selectAllMateriasHtml = `
            <label class="flex items-center space-x-2 p-1 rounded-md hover:bg-gray-100 cursor-pointer font-bold border-b pb-2 mb-1">
                <input type="checkbox" data-type="select-all-materias" class="custom-select-option rounded">
                <span>Selecionar tudo</span>
            </label>
        `;

        const materiasHtml = materias.map(materiaName => `
            <label class="flex items-center space-x-2 p-1 rounded-md hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" data-value="${materiaName}" data-type="materia" class="custom-select-option rounded">
                <span>${materiaName}</span>
            </label>
        `).join('');

        materiaContainer.innerHTML = selectAllMateriasHtml + materiasHtml;
    }

    setupCustomSelect(DOM.statsMateriaFilterCustom, (selected, e) => {
        const selectAllCheckbox = DOM.statsMateriaFilterCustom.querySelector('[data-type="select-all-materias"]');
        const materiaCheckboxes = DOM.statsMateriaFilterCustom.querySelectorAll('[data-type="materia"]');

        const triggeredBySelectAll = e.target && e.target.dataset.type === 'select-all-materias';

        if (triggeredBySelectAll) {
            const isChecked = selectAllCheckbox.checked;
            materiaCheckboxes.forEach(cb => cb.checked = isChecked);
        } else {
            const allChecked = Array.from(materiaCheckboxes).every(cb => cb.checked);
            const noneChecked = Array.from(materiaCheckboxes).every(cb => !cb.checked);

            if (allChecked && materiaCheckboxes.length > 0) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (noneChecked) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        const finalSelectedMaterias = Array.from(materiaCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.value);

        updateStatsAssuntoFilterCustom(finalSelectedMaterias);

        return finalSelectedMaterias;
    });

    setupCustomSelect(DOM.statsAssuntoFilterCustom, (selected, e) => {
        const selectAllCheckbox = DOM.statsAssuntoFilterCustom.querySelector('[data-type="select-all-assuntos"]');
        if (!selectAllCheckbox) return [];

        const assuntoCheckboxes = DOM.statsAssuntoFilterCustom.querySelectorAll('[data-type="assunto"]');
        const subAssuntoCheckboxes = DOM.statsAssuntoFilterCustom.querySelectorAll('[data-type="subassunto"]');
        const subSubAssuntoCheckboxes = DOM.statsAssuntoFilterCustom.querySelectorAll('[data-type="subsubassunto"]');

        const allCheckboxes = [ ...assuntoCheckboxes, ...subAssuntoCheckboxes, ...subSubAssuntoCheckboxes ];

        const triggeredBySelectAll = e.target && e.target.dataset.type === 'select-all-assuntos';

        if (triggeredBySelectAll) {
            const isChecked = selectAllCheckbox.checked;
            allCheckboxes.forEach(cb => {
                cb.checked = isChecked;
                cb.indeterminate = false;
            });
        } else {
            const allChecked = allCheckboxes.length > 0 && allCheckboxes.every(cb => cb.checked);
            const noneChecked = allCheckboxes.every(cb => !cb.checked && !cb.indeterminate);

            if (allChecked) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (noneChecked) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        const finalSelectedAssuntos = Array.from(allCheckboxes)
            .filter(cb => cb.checked && !cb.indeterminate)
            .map(cb => cb.dataset.value);

        return finalSelectedAssuntos;
    });

    updateStatsAssuntoFilterCustom([]);
}

export async function handleStatsFilter() {
    if (!state.currentUser) return;

    const periodButton = DOM.statsPeriodoButton;
    const selectedMaterias = JSON.parse(DOM.statsMateriaFilterCustom.dataset.value || '[]');
    const selectedAssuntos = JSON.parse(DOM.statsAssuntoFilterCustom.dataset.value || '[]');

    let startDate = periodButton.dataset.startDate ? new Date(periodButton.dataset.startDate + 'T00:00:00') : null;
    let endDate = periodButton.dataset.endDate ? new Date(periodButton.dataset.endDate + 'T23:59:59') : new Date();

    let evolutionStartDate = startDate;
    if (!evolutionStartDate) {
        evolutionStartDate = new Date(endDate);
        evolutionStartDate.setMonth(evolutionStartDate.getMonth() - 6);
        evolutionStartDate.setHours(0, 0, 0, 0);
    }

    const filters = {
        startDate: startDate,
        endDate: endDate,
        evolutionStartDate: evolutionStartDate,
        evolutionEndDate: endDate,
        materias: selectedMaterias,
        assuntos: selectedAssuntos,
    };

    await renderEstatisticasView(filters);
}

export async function renderEstatisticasView(filters = null) {
    if (!state.currentUser) {
        DOM.statsMainContent.innerHTML = '<p class="text-center text-gray-500 p-8">Por favor, faça login para ver suas estatísticas.</p>';
        return;
    }

    let appliedFilters = filters;
    if (!appliedFilters) {
        populateStatsFilters();

        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 6);
        startDate.setHours(0, 0, 0, 0);

        appliedFilters = {
            startDate: null,
            endDate: new Date(),
            evolutionStartDate: startDate,
            evolutionEndDate: new Date(),
            materias: [],
            assuntos: [],
        };
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    const materiasSet = new Set();

    const questionIdToDetails = new Map();
    state.allQuestions.forEach(q => {
        questionIdToDetails.set(q.id, {
            materia: q.materia,
            assunto: q.assunto,
            subAssunto: q.subAssunto,
            subSubAssunto: q.subSubAssunto
        });
    });

    const sessionMatchesFilter = (session) => {
        if (!appliedFilters || (!appliedFilters.materias.length && !appliedFilters.assuntos.length)) return true;

        const materiaMatch = appliedFilters.materias.length === 0 ||
                             Object.keys(session.details).some(materia => appliedFilters.materias.includes(materia));

        if (!materiaMatch) return false;

        if (appliedFilters.assuntos.length === 0) return true;

        return true;
    };

     const statMatchesFilter = (stat) => {
        if (!appliedFilters) return true;

        const materiaMatch = appliedFilters.materias.length === 0 || appliedFilters.materias.includes(stat.materia);
        if (!materiaMatch) return false;

        if (appliedFilters.materias.length === 0 && appliedFilters.assuntos.length === 0) return true;

        if (appliedFilters.assuntos.length > 0) {
             const details = questionIdToDetails.get(stat.questionId);
             if (details) {
                return appliedFilters.assuntos.includes(details.assunto) ||
                       (details.subAssunto && appliedFilters.assuntos.includes(details.subAssunto)) ||
                       (details.subSubAssunto && appliedFilters.assuntos.includes(details.subSubAssunto));
             }
             return false;
        }

        return true;
    };

    state.historicalSessions.forEach(session => {
        const sessionDate = session.createdAt ? session.createdAt.toDate() : null;

        if (appliedFilters && appliedFilters.startDate && sessionDate && sessionDate < appliedFilters.startDate) {
            return;
        }
        if (appliedFilters && appliedFilters.endDate && sessionDate && sessionDate > appliedFilters.endDate) {
            return;
        }
        if (appliedFilters && appliedFilters.materias.length > 0 && !sessionMatchesFilter(session)) {
             return;
        }

        let sessionTotal = 0;
        let sessionCorrect = 0;

        if (appliedFilters && appliedFilters.materias.length > 0) {
            appliedFilters.materias.forEach(materia => {
                const detail = session.details[materia];
                if(detail) {
                    sessionTotal += detail.total || 0;
                    sessionCorrect += detail.correct || 0;
                }
            });
        } else {
            sessionTotal = session.totalQuestions || 0;
            sessionCorrect = session.correctCount || 0;
        }

        totalQuestions += sessionTotal;
        totalCorrect += sessionCorrect;

        for (const materia in session.details) {
            if (!appliedFilters || appliedFilters.materias.length === 0 || appliedFilters.materias.includes(materia)) {
                materiasSet.add(materia);
            }
        }
    });

    state.sessionStats.forEach(stat => {
        if (appliedFilters && !statMatchesFilter(stat)) {
            return;
        }

        totalQuestions += 1;
        if (stat.isCorrect) {
            totalCorrect += 1;
        }
        materiasSet.add(stat.materia);
    });

    const totalIncorrect = totalQuestions - totalCorrect;
    const totalMaterias = materiasSet.size;

    if (DOM.statsGeralResolvidas) DOM.statsGeralResolvidas.textContent = totalQuestions;
    if (DOM.statsGeralAcertos) DOM.statsGeralAcertos.textContent = totalCorrect;
    if (DOM.statsGeralErros) DOM.statsGeralErros.textContent = totalIncorrect;
    if (DOM.statsGeralMaterias) DOM.statsGeralMaterias.textContent = totalMaterias;

    renderStatsPagePerformanceChart(totalCorrect, totalIncorrect);

    await renderDesempenhoMateriaTable(appliedFilters);

    const evoStartDate = appliedFilters.evolutionStartDate || new Date(new Date().setMonth(new Date().getMonth() - 6));
    const evoEndDate = appliedFilters.evolutionEndDate || new Date();

    const performanceLog = await fetchPerformanceLog(evoStartDate, evoEndDate);

    const filteredLog = performanceLog.filter(entry => {
        if (appliedFilters.materias.length > 0 && !appliedFilters.materias.includes(entry.materia)) {
            return false;
        }
        if (appliedFilters.assuntos.length > 0) {
            const assuntoMatch = appliedFilters.assuntos.includes(entry.assunto) ||
                                 (entry.subAssunto && appliedFilters.assuntos.includes(entry.subAssunto)) ||
                                 (entry.subSubAssunto && appliedFilters.assuntos.includes(entry.subSubAssunto));
            if (!assuntoMatch) {
                return false;
            }
        }
        return true;
    });

    renderEvolutionChart(filteredLog, appliedFilters.evolutionStartDate, appliedFilters.evolutionEndDate);
}

async function renderDesempenhoMateriaTable(filters = null) {
    if (!DOM.statsDesempenhoMateriaContainer) return;

    const questionIdToDetails = new Map();
    state.allQuestions.forEach(q => {
        if(q.materia && q.assunto) {
             questionIdToDetails.set(q.id, {
                materia: q.materia,
                assunto: q.assunto,
                subAssunto: q.subAssunto || null,
                subSubAssunto: q.subSubAssunto || null
            });
        }
    });

    const hierarchy = new Map();
    const createCounts = () => ({ total: 0, correct: 0, incorrect: 0 });

    const incrementCounts = (node, isCorrect, total = 1) => {
        node.counts.total += total;
        if (isCorrect) {
            node.counts.correct += total;
        } else {
            node.counts.incorrect += total;
        }
    };

    if (filters && filters.startDate) {
        const performanceLog = await fetchPerformanceLog(filters.startDate, filters.endDate);

        performanceLog.forEach(entry => {
            if (filters.materias.length > 0 && !filters.materias.includes(entry.materia)) {
                return;
            }
            if (filters.assuntos.length > 0) {
                const assuntoMatch = filters.assuntos.includes(entry.assunto) ||
                                     (entry.subAssunto && filters.assuntos.includes(entry.subAssunto)) ||
                                     (entry.subSubAssunto && filters.assuntos.includes(entry.subSubAssunto));
                if (!assuntoMatch) {
                    return;
                }
            }

            const { materia, assunto, subAssunto, subSubAssunto, isCorrect } = entry;

            if (!materia || !assunto) return;

            if (!hierarchy.has(materia)) {
                hierarchy.set(materia, { counts: createCounts(), assuntos: new Map() });
            }
            const materiaNode = hierarchy.get(materia);
            incrementCounts(materiaNode, isCorrect);

            if (!materiaNode.assuntos.has(assunto)) {
                materiaNode.assuntos.set(assunto, { counts: createCounts(), subAssuntos: new Map() });
            }
            const assuntoNode = materiaNode.assuntos.get(assunto);
            incrementCounts(assuntoNode, isCorrect);

            if (subAssunto) {
                if (!assuntoNode.subAssuntos.has(subAssunto)) {
                    assuntoNode.subAssuntos.set(subAssunto, { counts: createCounts(), subSubAssuntos: new Map() });
                }
                const subAssuntoNode = assuntoNode.subAssuntos.get(subAssunto);
                incrementCounts(subAssuntoNode, isCorrect);

                if (subSubAssunto) {
                    if (!subAssuntoNode.subSubAssuntos.has(subSubAssunto)) {
                        subAssuntoNode.subSubAssuntos.set(subSubAssunto, { counts: createCounts() });
                    }
                    const subSubAssuntoNode = subAssuntoNode.subSubAssuntos.get(subSubAssunto);
                    incrementCounts(subSubAssuntoNode, isCorrect);
                }
            }
        });

    } else {
        state.userQuestionHistoryMap.forEach(item => {
            const details = questionIdToDetails.get(item.id);
            if (!details) return;

            if (filters) {
                if (filters.materias.length > 0 && !filters.materias.includes(details.materia)) {
                    return;
                }
                if (filters.assuntos.length > 0) {
                    const assuntoMatch = filters.assuntos.includes(details.assunto) ||
                                         (details.subAssunto && filters.assuntos.includes(details.subAssunto)) ||
                                         (details.subSubAssunto && filters.assuntos.includes(details.subSubAssunto));
                    if (!assuntoMatch) {
                        return;
                    }
                }
            }

            const { materia, assunto, subAssunto, subSubAssunto } = details;
            const itemCorrect = item.correct || 0;
            const itemIncorrect = item.incorrect || 0;
            const itemTotal = item.total || 0;

            if (itemTotal === 0) return;

            if (!hierarchy.has(materia)) {
                hierarchy.set(materia, { counts: createCounts(), assuntos: new Map() });
            }
            const materiaNode = hierarchy.get(materia);
            materiaNode.counts.total += itemTotal;
            materiaNode.counts.correct += itemCorrect;
            materiaNode.counts.incorrect += itemIncorrect;

            if (!materiaNode.assuntos.has(assunto)) {
                materiaNode.assuntos.set(assunto, { counts: createCounts(), subAssuntos: new Map() });
            }
            const assuntoNode = materiaNode.assuntos.get(assunto);
            assuntoNode.counts.total += itemTotal;
            assuntoNode.counts.correct += itemCorrect;
            assuntoNode.counts.incorrect += itemIncorrect;

            if (subAssunto) {
                if (!assuntoNode.subAssuntos.has(subAssunto)) {
                    assuntoNode.subAssuntos.set(subAssunto, { counts: createCounts(), subSubAssuntos: new Map() });
                }
                const subAssuntoNode = assuntoNode.subAssuntos.get(subAssunto);
                subAssuntoNode.counts.total += itemTotal;
                subAssuntoNode.counts.correct += itemCorrect;
                subAssuntoNode.counts.incorrect += itemIncorrect;

                if (subSubAssunto) {
                    if (!subAssuntoNode.subSubAssuntos.has(subSubAssunto)) {
                        subAssuntoNode.subSubAssuntos.set(subSubAssunto, { counts: createCounts() });
                    }
                    const subSubAssuntoNode = subAssuntoNode.subSubAssuntos.get(subSubAssunto);
                    subSubAssuntoNode.counts.total += itemTotal;
                    subSubAssuntoNode.counts.correct += itemCorrect;
                    subSubAssuntoNode.counts.incorrect += itemIncorrect;
                }
            }
        });
    }

    if (hierarchy.size === 0) {
        let emptyMessage;
        if (filters && (filters.materias.length > 0 || filters.assuntos.length > 0 || filters.startDate)) {
             emptyMessage = "Não foram encontradas resoluções com o filtro selecionado.";
        } else {
             emptyMessage = "Não foram encontradas resoluções com o filtro selecionado.";
        }

        const emptyTemplate = html`
            <div class="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
                ${emptyMessage}
            </div>`;
        render(emptyTemplate, DOM.statsDesempenhoMateriaContainer);
        return;
    }

    const renderRows = (map, level = 1, parentId = '') => {
        const sortedKeys = Array.from(map.keys()).sort(naturalSort);
        let rows = [];
        for (const name of sortedKeys) {
            const node = map.get(name);
            const id = `${parentId}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
            let childRows = [];

            if (level === 1) { // Matéria
                const hasChildren = node.assuntos.size > 0;
                rows.push(renderTreeTableRow(level, name, node.counts, `materia-${id}`, parentId, hasChildren));
                if (hasChildren) {
                    childRows = renderRows(node.assuntos, level + 1, `materia-${id}`);
                }
            } else if (level === 2) { // Assunto
                const hasChildren = node.subAssuntos.size > 0;
                rows.push(renderTreeTableRow(level, name, node.counts, `assunto-${id}`, parentId, hasChildren));
                 if (hasChildren) {
                    childRows = renderRows(node.subAssuntos, level + 1, `assunto-${id}`);
                }
            } else if (level === 3) { // SubAssunto
                const hasChildren = node.subSubAssuntos.size > 0;
                rows.push(renderTreeTableRow(level, name, node.counts, `subassunto-${id}`, parentId, hasChildren));
                 if (hasChildren) {
                    childRows = renderRows(node.subSubAssuntos, level + 1, `subassunto-${id}`);
                }
            } else if (level === 4) { // SubSubAssunto
                rows.push(renderTreeTableRow(level, name, node.counts, `subsubassunto-${id}`, parentId, false));
            }
            rows = rows.concat(childRows);
        }
        return rows;
    };

    const tableRows = renderRows(hierarchy);

    const tableTemplate = html`
        <style>
            .tree-table .indent-1 { padding-left: 1rem; }
            .tree-table .indent-2 { padding-left: 3rem; }
            .tree-table .indent-3 { padding-left: 5rem; }
            .tree-table .indent-4 { padding-left: 7rem; }
        </style>
        <div class="tree-table bg-white rounded-t-lg shadow-md overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-100">
                    <tr class="header-row">
                        <th class="tree-table-cell checkbox-cell">
                            <input type="checkbox" id="select-all-stats-checkbox" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </th>
                        <th class="tree-table-cell text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matéria / Assunto</th>
                        <th class="tree-table-cell text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Questões Resolvidas</th>
                        <th class="tree-table-cell text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desempenho</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${tableRows}
                </tbody>
            </table>
        </div>
        <div id="stats-selection-footer" class="flex items-center space-x-6 text-sm font-medium text-gray-700">
            <span>Seleção:</span>
            <span>Resolvidas: <strong id="stats-footer-resolvidas" class="text-gray-900">0</strong></span>
            <span>Acertos: <strong id="stats-footer-acertos" class="text-green-600">0</strong></span>
            <span>Erros: <strong id="stats-footer-erros" class="text-red-600">0</strong></span>
        </div>
    `;

    render(tableTemplate, DOM.statsDesempenhoMateriaContainer);

    DOM.statsSelectionFooter = document.getElementById('stats-selection-footer');
    DOM.statsFooterResolvidas = document.getElementById('stats-footer-resolvidas');
    DOM.statsFooterAcertos = document.getElementById('stats-footer-acertos');
    DOM.statsFooterErros = document.getElementById('stats-footer-erros');
}

function renderTreeTableRow(level, name, counts, id, parentId = '', hasChildren = false) {
    const { total, correct, incorrect } = counts;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    const errorAccuracy = total > 0 ? (incorrect / total) * 100 : 0;

    const rowClass = `tree-table-row ${level > 1 ? 'hidden-row' : ''} ${
        level === 1 ? 'materia-row' :
        level === 2 ? 'assunto-row' :
        level === 3 ? 'sub-assunto-row' : 'sub-sub-assunto-row'
    }`;
    const indentClass = `indent-${level}`;

    const icon = hasChildren
        ? html`<i class="fas fa-chevron-right toggle-icon"></i>`
        : html`<i class="fas fa-chevron-right toggle-icon no-children"></i>`;

    return html`
        <tr class="${rowClass}" data-id="${id}" data-parent-id="${parentId}" data-level="${level}"
            data-total="${total}" data-correct="${correct}" data-incorrect="${incorrect}">
            <td class="tree-table-cell checkbox-cell">
                <input type="checkbox" class="row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-id="${id}">
            </td>
            <td class="tree-table-cell text-gray-800 ${indentClass}">
                <div class="flex items-center">
                    ${icon}
                    <span class="font-medium">${name}</span>
                </div>
            </td>
            <td class="tree-table-cell text-gray-500 text-center">${total}</td>
            <td class="tree-table-cell">
                <div class="flex items-center space-x-2">
                    <div class="performance-bar-bg">
                        <div class="performance-bar" style="width: ${accuracy.toFixed(0)}%;"></div>
                    </div>
                    <span class="text-sm font-semibold ${accuracy >= 60 ? 'text-green-600' : 'text-red-600'}">${accuracy.toFixed(0)}%</span>
                    <span class="text-sm text-gray-500">(${correct})</span>
                    <span class="text-sm font-semibold text-red-500 ml-2">${errorAccuracy.toFixed(0)}%</span>
                    <span class="text-sm text-gray-500">(${incorrect})</span>
                </div>
            </td>
        </tr>
    `;
}

function updateStatsFooter() {
    let total = 0, correct = 0, incorrect = 0;

    const selectedCheckboxes = DOM.statsDesempenhoMateriaContainer.querySelectorAll('.row-checkbox:checked');
    selectedCheckboxes.forEach(checkbox => {
        const row = checkbox.closest('.tree-table-row');
        total += parseInt(row.dataset.total, 10);
        correct += parseInt(row.dataset.correct, 10);
        incorrect += parseInt(row.dataset.incorrect, 10);
    });

    if (DOM.statsFooterResolvidas) DOM.statsFooterResolvidas.textContent = total;
    if (DOM.statsFooterAcertos) DOM.statsFooterAcertos.textContent = correct;
    if (DOM.statsFooterErros) DOM.statsFooterErros.textContent = incorrect;
}

export function setupStatsEventListeners() {
    if (DOM.statsView) {
        DOM.statsView.addEventListener('click', (e) => {
            const target = e.target;

            if (target.id === 'stats-aplicar-filtros') {
                handleStatsFilter();
            }

            if (target.classList.contains('toggle-icon') && !target.classList.contains('no-children')) {
                const row = target.closest('.tree-table-row');
                if (row) {
                    const rowId = row.dataset.id;
                    const isExpanded = row.classList.contains('expanded');

                    document.querySelectorAll(`.tree-table-row[data-parent-id="${rowId}"]`).forEach(childRow => {
                        childRow.classList.toggle('hidden-row', isExpanded);
                    });

                    row.classList.toggle('expanded', !isExpanded);
                    target.classList.toggle('fa-chevron-down', !isExpanded);
                    target.classList.toggle('fa-chevron-right', isExpanded);
                }
            }
        });
    }

    if (DOM.statsDesempenhoMateriaContainer) {
        DOM.statsDesempenhoMateriaContainer.addEventListener('change', (e) => {
            const target = e.target;

            if (target.classList.contains('row-checkbox') || target.id === 'select-all-stats-checkbox') {
                const isSelectAll = target.id === 'select-all-stats-checkbox';
                const mainCheckbox = isSelectAll ? target : document.getElementById('select-all-stats-checkbox');
                const allRowCheckboxes = DOM.statsDesempenhoMateriaContainer.querySelectorAll('.row-checkbox');

                if (isSelectAll) {
                    allRowCheckboxes.forEach(cb => cb.checked = mainCheckbox.checked);
                } else {
                    const allChecked = Array.from(allRowCheckboxes).every(cb => cb.checked);
                    const noneChecked = Array.from(allRowCheckboxes).every(cb => !cb.checked);

                    if (allChecked) {
                        mainCheckbox.checked = true;
                        mainCheckbox.indeterminate = false;
                    } else if (noneChecked) {
                        mainCheckbox.checked = false;
                        mainCheckbox.indeterminate = false;
                    } else {
                        mainCheckbox.checked = false;
                        mainCheckbox.indeterminate = true;
                    }
                }
                updateStatsFooter();
            }
        });
    }
}

subscribe('historicalSessions', updateStatsPageUI);
subscribe('userQuestionHistoryMap', () => {
    if (DOM.estatisticasView && !DOM.estatisticasView.classList.contains('hidden')) {
        const periodButton = DOM.statsPeriodoButton;
        if (!periodButton || periodButton.dataset.value === 'tudo') {
           renderEstatisticasView();
        }
    }
});
