/**
 * @file js/ui/question-solver-ui.js
 * @description Provides a reusable function to render the question-solving interface.
 */

/**
 * Renders the complete question-solving UI into a specified container.
 * This eliminates the need for HTML cloning and prevents duplicate element IDs.
 * @param {HTMLElement} container - The DOM element where the UI should be injected.
 */
export function renderQuestionSolver(container) {
    if (!container) return;

    const solverHTML = `
        <div id="tabs-and-main-content">
            <div id="main-content-container" class="bg-gray-50 rounded-xl shadow-md">
                <div class="p-4 border-b border-gray-200">
                    <h3 id="question-counter-top" class="flex items-baseline text-xl text-gray-800 hidden"></h3>
                </div>
                <div class="flex flex-wrap justify-between items-center gap-y-2 gap-x-4 p-4 border-b border-gray-200 text-sm">
                    <div id="question-info-container" class="text-gray-600 space-y-1 hidden"></div>
                    <div id="question-toolbar" class="flex items-center flex-wrap gap-x-4 gap-y-2 text-gray-600 hidden">
                        <!-- Toolbar will be inserted here by displayQuestion() -->
                    </div>
                </div>
                <div class="p-6">
                    <div id="question-view">
                        <div id="questions-container" class="space-y-6">
                            <!-- Questions will be inserted here by displayQuestion() -->
                        </div>
                        <div id="navigation-controls" class="flex justify-start items-center mt-8 space-x-4 hidden">
                            <button id="prev-question-btn" class="w-12 h-12 flex items-center justify-center border bg-white transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <img src="img/anterior-ativo.svg" alt="Questão Anterior" class="w-9 h-9">
                            </button>
                            <button id="next-question-btn" class="w-12 h-12 flex items-center justify-center border bg-white transition">
                                <img src="img/proxima-ativo.svg" alt="Próxima Questão" class="w-9 h-9">
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = solverHTML;
}
