/**
 * Intelligent A4 Print Paginator & Dynamic Spacing Engine
 * 
 * Complies with Academic Examination Standards:
 * 1. Measures exact A4 printable height with narrow margins (6mm top/bottom, 7mm left/right).
 * 2. Accounts for Masthead (Page 1) vs Continuation Headers (Page 2+), running footers, and Sign-off blocks.
 * 3. Measures actual rendered heights of each question (considering text length, diagrams, options, and tables).
 * 4. Prevents bad page breaks by keeping each question block atomic.
 * 5. Intelligently calculates unused vertical space per page / column.
 * 6. Dynamically distributes the remaining space across question gaps and card padding, avoiding both crowded clumps and large empty voids.
 * 7. Embeds seamlessly into standalone HTML windows/iframes and preview modals.
 */

export interface DynamicPaginationOptions {
  schoolName?: string;
  examTitle?: string;
  studentName?: string;
  studentRoll?: string;
  className?: string;
  subject?: string;
  columnLayout?: 'single' | 'two_column';
  isEvaluatedScript?: boolean;
  autoPrint?: boolean;
}

export function generateDynamicPaginationScript(options: DynamicPaginationOptions = {}): string {
  const {
    schoolName = 'Academic Assessment Board',
    examTitle = 'Examination Paper',
    studentName = '',
    studentRoll = '',
    className = 'Class',
    subject = 'General',
    columnLayout = 'two_column',
    isEvaluatedScript = false,
    autoPrint = true,
  } = options;

  return `
  (function() {
    function runPaginationAndSpacing() {
      // 1. Measure exact A4 dimensions at current print resolution
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;height:297mm;visibility:hidden;padding:0;margin:0;';
      document.body.appendChild(probe);
      var a4H = probe.getBoundingClientRect().height || 1122.5;
      var a4W = probe.getBoundingClientRect().width || 793.7;
      document.body.removeChild(probe);

      // Narrow academic margins: 6mm top, 6mm bottom (12mm total)
      var marginVerticalPx = (12 / 297) * a4H;
      // 18px safety buffer to guarantee zero phantom page breaks
      var usablePageHeight = Math.floor(a4H - marginVerticalPx - 18);

      var container = document.querySelector('.exam-document') || 
                      document.querySelector('.academic-paper-layout') || 
                      document.getElementById('printable-assessment-document') ||
                      document.getElementById('printable-exam-paper') ||
                      document.querySelector('.print-content-root') ||
                      document.body;

      if (!container) return;

      var masthead = container.querySelector('.masthead-block') || 
                     container.querySelector('.masthead-container') ||
                     container.querySelector('.academic-exam-header') ||
                     container.querySelector('[data-slot="masthead"]');

      var endSignOff = container.querySelector('.end-sign-off');

      // Select all question blocks
      var questionCards = Array.from(container.querySelectorAll('.question-block, .q-card, .print-card'));
      if (questionCards.length === 0) {
        ${autoPrint ? 'setTimeout(function() { window.focus(); window.print(); }, 200);' : ''}
        return;
      }

      // Extract existing elements from container without destroying them
      var mastheadClone = masthead ? masthead.cloneNode(true) : null;
      var endSignOffClone = endSignOff ? endSignOff.cloneNode(true) : null;

      // Measure masthead height
      var mastheadH = masthead ? masthead.getBoundingClientRect().height + 8 : 0;
      var footerH = 26; // Height of running footer: Page X of Y
      var contHeaderH = 34; // Height of slim continuation header
      var signOffH = endSignOff ? (endSignOff.getBoundingClientRect().height || 60) + 10 : 0;

      // Detect column mode
      var isSingleCol = ${columnLayout === 'single'} || 
                        container.querySelector('.single-col-layout') !== null ||
                        (container.getAttribute('data-layout') === 'single');

      // Measure unconstrained rendered heights of all questions
      var questionHeights = questionCards.map(function(card) {
        card.style.pageBreakInside = 'avoid';
        card.style.breakInside = 'avoid';
        card.style.webkitColumnBreakInside = 'avoid';
        card.style.boxSizing = 'border-box';
        var rect = card.getBoundingClientRect();
        return Math.max(rect.height, card.offsetHeight, 45);
      });

      // Pagination Algorithm
      // Page 1 availableHeight = usablePageHeight - mastheadH - footerH
      // Page 2+ availableHeight = usablePageHeight - contHeaderH - footerH
      var pages = [];
      var curPageQuestions = isSingleCol ? [] : { col1: [], col2: [] };
      var curCol = 1;
      var curColH = 0;
      var isPage1 = true;
      var pageAvailH = usablePageHeight - mastheadH - footerH;

      for (var i = 0; i < questionCards.length; i++) {
        var card = questionCards[i];
        var cardH = questionHeights[i];
        var baseGap = 5;

        if (isSingleCol) {
          var neededH = curPageQuestions.length === 0 ? cardH : (cardH + baseGap);
          if (curColH + neededH <= pageAvailH || curPageQuestions.length === 0) {
            curPageQuestions.push({ el: card, height: cardH });
            curColH += neededH;
          } else {
            // Push completed page and start new page
            pages.push({ questions: curPageQuestions, isFirst: isPage1, availH: pageAvailH });
            isPage1 = false;
            pageAvailH = usablePageHeight - contHeaderH - footerH;
            curPageQuestions = [{ el: card, height: cardH }];
            curColH = cardH;
          }
        } else {
          // Two-column layout
          var targetList = curCol === 1 ? curPageQuestions.col1 : curPageQuestions.col2;
          var neededH = targetList.length === 0 ? cardH : (cardH + baseGap);

          if (curColH + neededH <= pageAvailH || targetList.length === 0) {
            targetList.push({ el: card, height: cardH });
            curColH += neededH;
          } else if (curCol === 1) {
            // Move to Column 2 of same page
            curCol = 2;
            curColH = cardH;
            curPageQuestions.col2.push({ el: card, height: cardH });
          } else {
            // Both columns full on current page -> Start next page
            pages.push({ questions: curPageQuestions, isFirst: isPage1, availH: pageAvailH });
            isPage1 = false;
            pageAvailH = usablePageHeight - contHeaderH - footerH;
            curPageQuestions = { col1: [{ el: card, height: cardH }], col2: [] };
            curCol = 1;
            curColH = cardH;
          }
        }
      }

      // Add final page
      if (isSingleCol) {
        if (curPageQuestions.length > 0) {
          pages.push({ questions: curPageQuestions, isFirst: isPage1, availH: pageAvailH });
        }
      } else {
        if (curPageQuestions.col1.length > 0 || curPageQuestions.col2.length > 0) {
          pages.push({ questions: curPageQuestions, isFirst: isPage1, availH: pageAvailH });
        }
      }

      var totalPages = pages.length;

      // Balance two-column layout on final page if Column 1 has many and Column 2 has few
      if (!isSingleCol && totalPages > 0) {
        var lastP = pages[totalPages - 1];
        var allLastQuestions = lastP.questions.col1.concat(lastP.questions.col2);
        if (allLastQuestions.length >= 2) {
          var half = Math.ceil(allLastQuestions.length / 2);
          lastP.questions.col1 = allLastQuestions.slice(0, half);
          lastP.questions.col2 = allLastQuestions.slice(half);
        }
      }

      // Clear container to reconstruct paginated layout with dynamic spacing
      container.innerHTML = '';
      container.style.padding = '0';
      container.style.margin = '0 auto';
      container.style.maxWidth = '100%';

      // Build each Page
      pages.forEach(function(pageData, pIdx) {
        var pageNum = pIdx + 1;
        var isFirst = pageData.isFirst;
        var isLast = pageNum === totalPages;
        var availH = pageData.availH;

        var pageDiv = document.createElement('div');
        pageDiv.className = 'exam-print-page academic-paper-layout';
        pageDiv.style.cssText = 
          'width: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;' +
          'min-height: ' + usablePageHeight + 'px; position: relative; background: #ffffff;' +
          'page-break-after: ' + (isLast ? 'avoid' : 'always') + '; break-after: ' + (isLast ? 'avoid' : 'page') + ';' +
          'margin-bottom: ' + (isLast ? '0' : '16px') + ';';

        var topSlot = document.createElement('div');
        topSlot.style.cssText = 'width: 100%; flex: 1 0 auto; display: flex; flex-direction: column;';

        // Add Header
        if (isFirst && mastheadClone) {
          topSlot.appendChild(mastheadClone.cloneNode(true));
        } else if (!isFirst) {
          var contHead = document.createElement('div');
          contHead.className = 'continuation-header';
          contHead.style.cssText = 'border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3.5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #475569; font-weight: 600;';
          contHead.innerHTML = 
            '<div><strong style="color: #0f172a;">' + escapeHtml(examTitle) + '</strong> &bull; ' + 
            (studentName ? ('Candidate: <strong style="color: #0f172a;">' + escapeHtml(studentName) + '</strong> &bull; ') : '') +
            (studentRoll ? ('Roll: <strong style="color: #1e3a8a;">' + escapeHtml(studentRoll) + '</strong> &bull; ') : '') +
            'Subject: <strong style="color: #0f172a;">' + escapeHtml(subject) + '</strong></div>' +
            '<div style="font-weight: 800; color: #1e3a8a;">Page ' + pageNum + ' of ' + totalPages + '</div>';
          topSlot.appendChild(contHead);
        }

        // Apply Dynamic Spacing Engine to questions
        function applyDynamicSpacing(items, colHeightLimit) {
          var colDiv = document.createElement('div');
          colDiv.style.cssText = 'display: flex; flex-direction: column; width: 100%; box-sizing: border-box;';

          if (!items || items.length === 0) return colDiv;

          var totalItemsHeight = items.reduce(function(sum, it) { return sum + it.height; }, 0);
          var unusedSpace = Math.max(0, colHeightLimit - totalItemsHeight);
          var n = items.length;

          var baseGap = 14;
          var finalGap = baseGap;
          var addedPaddingY = 0;

          if (n > 1) {
            var numGaps = n - 1;
            var spare = unusedSpace - (numGaps * baseGap);
            if (spare > 6) {
              // Intelligently distribute spare space: capped to 30px to prevent awkward giant gaps
              var extraPerGap = spare / numGaps;
              var cappedExtra = Math.min(extraPerGap, 28);
              finalGap = Math.round(baseGap + cappedExtra);

              // If there is still extra space, slightly augment card padding for maximum legibility
              var leftover = spare - (cappedExtra * numGaps);
              if (leftover > 10 && cappedExtra >= 12) {
                addedPaddingY = Math.min(Math.floor(leftover / (n * 2)), 6);
              }
            } else {
              // Page is comfortably full
              finalGap = Math.max(8, Math.min(baseGap, Math.floor(unusedSpace / numGaps)));
            }
          } else if (n === 1) {
            // Single question alone on column: comfortable natural margins
            finalGap = 0;
            items[0].el.style.marginTop = '6px';
            items[0].el.style.marginBottom = '14px';
          }

          items.forEach(function(it, idx) {
            var qEl = it.el;
            qEl.style.boxSizing = 'border-box';
            qEl.style.breakInside = 'avoid';
            qEl.style.pageBreakInside = 'avoid';
            qEl.style.webkitColumnBreakInside = 'avoid';
            qEl.style.marginBottom = (idx === n - 1) ? '0px' : (finalGap + 'px');
            
            if (addedPaddingY > 0) {
              qEl.style.paddingTop = (8 + addedPaddingY) + 'px';
              qEl.style.paddingBottom = (8 + addedPaddingY) + 'px';
            }
            colDiv.appendChild(qEl);
          });

          return colDiv;
        }

        // Questions Row / Columns
        var questionsContainer = document.createElement('div');
        questionsContainer.className = 'exam-page-content';
        questionsContainer.style.cssText = 'width: 100%; flex: 1 0 auto; box-sizing: border-box;';

        if (isSingleCol) {
          var singleColDiv = applyDynamicSpacing(pageData.questions, availH);
          questionsContainer.appendChild(singleColDiv);
        } else {
          var twoColGrid = document.createElement('div');
          twoColGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; column-gap: 7mm; align-items: start; width: 100%; box-sizing: border-box;';
          var col1El = applyDynamicSpacing(pageData.questions.col1, availH);
          var col2El = applyDynamicSpacing(pageData.questions.col2, availH);
          twoColGrid.appendChild(col1El);
          twoColGrid.appendChild(col2El);
          questionsContainer.appendChild(twoColGrid);
        }

        topSlot.appendChild(questionsContainer);

        // Append Sign-off if on the last page
        if (isLast && endSignOffClone) {
          topSlot.appendChild(endSignOffClone.cloneNode(true));
        }

        pageDiv.appendChild(topSlot);

        // Running Footer
        var footerDiv = document.createElement('div');
        footerDiv.className = 'page-footer';
        footerDiv.style.cssText = 
          'border-top: 1px solid #e2e8f0; padding-top: 3px; margin-top: 5px; display: flex; justify-content: space-between;' +
          'align-items: center; font-size: 7.5px; color: #64748b; font-weight: 600; break-inside: avoid; page-break-inside: avoid; flex-shrink: 0;';
        footerDiv.innerHTML = 
          '<span>' + escapeHtml(schoolName) + ' &bull; ' + (isEvaluatedScript ? 'Evaluated Student Answer Script' : 'Official Examination Paper') + '</span>' +
          '<span style="font-weight: 800; color: #1e3a8a;">Page ' + pageNum + ' of ' + totalPages + '</span>';
        
        pageDiv.appendChild(footerDiv);
        container.appendChild(pageDiv);
      });

      ${autoPrint ? `
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
      ` : ''}
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Run when images and DOM are ready
    function initPaginator() {
      var images = Array.from(document.querySelectorAll('img'));
      if (!images.length) {
        runPaginationAndSpacing();
        return;
      }
      var pending = images.length;
      var executed = false;
      function done() {
        pending--;
        if (pending <= 0 && !executed) {
          executed = true;
          runPaginationAndSpacing();
        }
      }
      images.forEach(function(img) {
        if (img.complete && img.naturalWidth > 0) {
          done();
        } else {
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        }
      });
      setTimeout(function() {
        if (!executed) {
          executed = true;
          runPaginationAndSpacing();
        }
      }, 800);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initPaginator();
    } else {
      window.addEventListener('DOMContentLoaded', initPaginator);
    }
  })();
  `;
}
