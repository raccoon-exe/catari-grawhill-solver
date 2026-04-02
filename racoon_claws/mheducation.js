let messageListener = null;
let isAutomating = false; // bot goes brrrrrrr
let lastIncorrectQuestion = null;
let lastCorrectAnswer = null;

function setupMessageListener() {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  messageListener = (message, sender, sendResponse) => {
    if (message.type === "processChatGPTResponse") {
      processChatGPTResponse(message.response);
      sendResponse({ received: true });
      return true;
    }

    if (message.type === "alertMessage") {
      alert(message.message);
      sendResponse({ received: true });
      return true;
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);
}

function handleTopicOverview() {
  const continueButton = document.querySelector(
    "awd-topic-overview-button-bar .next-button, .button-bar-wrapper .next-button"
  );

  if (
    continueButton &&
    continueButton.textContent.trim().toLowerCase().includes("continue")
  ) {
    continueButton.click();

    setTimeout(() => {
      if (isAutomating) {
        checkForNextStep();
      }
    }, 1000);

    return true;
  }
  return false;
}

// teacher forces us to read, but we click next haha
function handleForcedLearning() {
  const forcedLearningAlert = document.querySelector(
    ".forced-learning .alert-error"
  );
  if (forcedLearningAlert) {
    const readButton = document.querySelector(
      '[data-automation-id="lr-tray_reading-button"]'
    );
    if (readButton) {
      readButton.click();

      waitForElement('[data-automation-id="reading-questions-button"]', 10000)
        .then((toQuestionsButton) => {
          toQuestionsButton.click();
          return waitForElement(".next-button", 10000);
        })
        .then((nextButton) => {
          nextButton.click();
          if (isAutomating) {
            setTimeout(() => {
              checkForNextStep();
            }, 1000);
          }
        })
        .catch((error) => {
          console.error("Error in forced learning flow:", error);
          isAutomating = false;
        });
      return true;
    }
  }
  return false;
}

function checkForNextStep() {
  if (!isAutomating) return;

  if (handleTopicOverview()) {
    return;
  }

  if (handleForcedLearning()) {
    return;
  }

  const container = document.querySelector(".probe-container");
  if (container && !container.querySelector(".forced-learning")) {
    const qData = parseQuestion();
    if (qData) {
      chrome.runtime.sendMessage({
        type: "sendQuestionToChatGPT",
        question: qData,
      });
    }
  }
}

// steal correct answer if we are wrong
function extractCorrectAnswer() {
  const container = document.querySelector(".probe-container");
  if (!container) return null;

  const incorrectMarker = container.querySelector(
    ".awd-probe-correctness.incorrect"
  );
  if (!incorrectMarker) return null;

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const spans = promptClone.querySelectorAll(
      "span.response-container, span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    spans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      input.parentNode.replaceChild(blankMarker, input);
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let correctAnswer = null;

  if (questionType === "multiple_choice" || questionType === "true_false") {
    try {
      const answerContainer = container.querySelector(
        ".answer-container .choiceText"
      );
      if (answerContainer) {
        correctAnswer = answerContainer.textContent.trim();
      } else {
        const correctAnswerContainer = container.querySelector(
          ".correct-answer-container"
        );
        if (correctAnswerContainer) {
          const answerText =
            correctAnswerContainer.querySelector(".choiceText");
          if (answerText) {
            correctAnswer = answerText.textContent.trim();
          } else {
            const answerDiv = correctAnswerContainer.querySelector(".choice");
            if (answerDiv) {
              correctAnswer = answerDiv.textContent.trim();
            }
          }
        }
      }
    } catch (e) {
      console.error("Error extracting multiple choice answer:", e);
    }
  } else if (questionType === "multiple_select") {
    try {
      const correctAnswersList = container.querySelectorAll(
        ".correct-answer-container .choice"
      );
      if (correctAnswersList && correctAnswersList.length > 0) {
        correctAnswer = Array.from(correctAnswersList).map((el) => {
          const choiceText = el.querySelector(".choiceText");
          return choiceText
            ? choiceText.textContent.trim()
            : el.textContent.trim();
        });
      }
    } catch (e) {
      console.error("Error extracting multiple select answers:", e);
    }
  } else if (questionType === "fill_in_the_blank") {
    try {
      const correctAnswersList = container.querySelectorAll(".correct-answers");

      if (correctAnswersList && correctAnswersList.length > 0) {
        if (correctAnswersList.length === 1) {
          const correctAnswerEl =
            correctAnswersList[0].querySelector(".correct-answer");
          if (correctAnswerEl) {
            correctAnswer = correctAnswerEl.textContent.trim();
          } else {
            const answerText = correctAnswersList[0].textContent.trim();
            if (answerText) {
              const match = answerText.match(/:\s*(.+)$/);
              correctAnswer = match ? match[1].trim() : answerText;
            }
          }
        } else {
          correctAnswer = Array.from(correctAnswersList).map((field) => {
            const correctAnswerEl = field.querySelector(".correct-answer");
            if (correctAnswerEl) {
              return correctAnswerEl.textContent.trim();
            } else {
              const answerText = field.textContent.trim();
              const match = answerText.match(/:\s*(.+)$/);
              return match ? match[1].trim() : answerText;
            }
          });
        }
      }
    } catch (e) {
      console.error("Error extracting fill in the blank answers:", e);
    }
  }

  if (questionType === "matching") {
    return null;
  }

  if (correctAnswer === null) {
    console.error("Failed to extract correct answer for", questionType);
    return null;
  }

  return {
    question: questionText,
    answer: correctAnswer,
    type: questionType,
  };
}

function cleanAnswer(answer) {
  if (!answer) return answer;

  if (Array.isArray(answer)) {
    return answer.map((item) => cleanAnswer(item));
  }

  if (typeof answer === "string") {
    let cleanedAnswer = answer.trim();

    cleanedAnswer = cleanedAnswer.replace(/^Field \d+:\s*/, "");

    if (cleanedAnswer.includes(" or ")) {
      cleanedAnswer = cleanedAnswer.split(" or ")[0].trim();
    }

    return cleanedAnswer;
  }

  return answer;
}

function processChatGPTResponse(responseText) {
  try {
    if (handleTopicOverview()) {
      return;
    }

    if (handleForcedLearning()) {
      return;
    }

    const response = JSON.parse(responseText);
    const answers = Array.isArray(response.answer)
      ? response.answer
      : [response.answer];

    const container = document.querySelector(".probe-container");
    if (!container) return;

    lastIncorrectQuestion = null;
    lastCorrectAnswer = null;

    if (container.querySelector(".awd-probe-type-matching")) {
      // Create a visible debug log on the screen
      let debugLog = document.getElementById('racoon-debug-log');
      if (!debugLog) {
        debugLog = document.createElement('div');
        debugLog.id = 'racoon-debug-log';
        debugLog.style.position = 'fixed';
        debugLog.style.top = '100px';
        debugLog.style.right = '20px';
        debugLog.style.background = 'rgba(0,0,0,0.8)';
        debugLog.style.color = '#00ff00';
        debugLog.style.padding = '15px';
        debugLog.style.fontSize = '12px';
        debugLog.style.zIndex = '10000';
        debugLog.style.borderRadius = '5px';
        debugLog.style.fontFamily = 'monospace';
        debugLog.style.maxWidth = '300px';
        document.body.appendChild(debugLog);
      }

      const log = (msg) => {
        debugLog.innerHTML += `<div>> ${msg}</div>`;
        console.log(`[Racoon] ${msg}`);
      };

      log("Solving Matching Question...");

      // search string in dom like monkey
      const findBestDomMatch = (text) => {
        if (!text) return null;
        const search = text.toLowerCase().trim().substring(0, 20); // First 20 chars

        // Search in the ENTIRE container, not just deep nested elements
        const allComps = Array.from(container.querySelectorAll('*')); // All elements

        // Find elements containing the text
        const matches = allComps.filter(el => {
          // Avoid script/style tags
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return false;
          const content = (el.innerText || el.textContent || "").toLowerCase();
          return content.includes(search);
        });

        if (matches.length > 0) {
          // Sort by text length to find the tightest match
          matches.sort((a, b) => {
            const aText = (a.innerText || a.textContent || "");
            const bText = (b.innerText || b.textContent || "");
            return aText.length - bText.length;
          });

          // Pick the tightest match
          let match = matches[0];

          // Walk up to find a draggable or substantial container
          let el = match;
          let attempts = 0;
          while (el && el !== container && attempts < 15) {
            const style = window.getComputedStyle(el);
            const cursor = style.cursor;

            if (el.draggable ||
              el.getAttribute('draggable') === 'true' ||
              ['pointer', 'move', 'grab', 'grabbing', '-webkit-grab'].includes(cursor) ||
              el.classList.contains('choice') ||
              el.classList.contains('match-prompt') ||
              el.classList.contains('content') ||
              el.getAttribute('role') === 'button' ||
              el.getAttribute('role') === 'listitem') {
              return el;
            }
            el = el.parentElement;
            attempts++;
          }
          return match; // Fallback to the text node itself
        }

        log(`⚠️ No matches found for "${search.substring(0, 10)}..."`);
        return null;
      };

      // Ultimate Interaction Simulator v4
      // Includes Native DnD, Mouse, Touch, and DOM Teleportation
      // goodluck debugging this code, we drag and drop so hard
      const simulateInteraction = (source, target) => {
        if (!source || !target) return;

        log("🚀 Initiating Ultimate Drag Sequence...");

        // Visual Feedback
        const originalSourceBorder = source.style.border;
        const originalTargetBorder = target.style.border;
        source.style.border = "4px solid #00ff00";
        target.style.border = "4px solid #ff0000";
        source.style.zIndex = "99999";

        const rects = {
          source: source.getBoundingClientRect(),
          target: target.getBoundingClientRect()
        };

        const center = {
          source: {
            x: rects.source.left + rects.source.width / 2,
            y: rects.source.top + rects.source.height / 2
          },
          target: {
            x: rects.target.left + rects.target.width / 2,
            y: rects.target.top + rects.target.height / 2
          }
        };

        const createEvent = (type, x, y, opts = {}) => {
          const defaults = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: x, clientY: y,
            screenX: x, screenY: y,
            button: 0, buttons: 1,
            which: 1, pointerId: 1,
            isPrimary: true,
            ...opts
          };

          if (type.startsWith('drag') || type === 'drop') {
            const dt = new DataTransfer();
            dt.effectAllowed = 'copyMove';
            dt.dropEffect = 'move';
            dt.setData('text/plain', source.innerText);
            return new DragEvent(type, { ...defaults, dataTransfer: dt });
          } else if (type.startsWith('touch')) {
            const touch = new Touch({
              identifier: Date.now(),
              target: opts.target || source,
              clientX: x, clientY: y,
              screenX: x, screenY: y,
              ignoreMultiTouch: false
            });
            return new TouchEvent(type, {
              ...defaults,
              touches: [touch],
              targetTouches: [touch],
              changedTouches: [touch]
            });
          } else if (type.startsWith('pointer')) {
            return new PointerEvent(type, defaults);
          } else {
            return new MouseEvent(type, defaults);
          }
        };

        const dispatch = (el, type, x, y, opts) => el.dispatchEvent(createEvent(type, x, y, opts));

        // --- SequenceRunner ---
        const runSequence = async () => {
          // 1. Accessibility Click (Click-Click)
          log("Strategy 1: Click-Click");
          dispatch(source, 'click', center.source.x, center.source.y);
          await new Promise(r => setTimeout(r, 100));
          dispatch(target, 'click', center.target.x, center.target.y);
          await new Promise(r => setTimeout(r, 200));

          // 2. Touch Simulation (Mobile/Tablet view support)
          log("Strategy 2: Touch Drag");
          dispatch(source, 'touchstart', center.source.x, center.source.y, { target: source });
          await new Promise(r => setTimeout(r, 50));
          dispatch(source, 'touchmove', center.source.x, center.source.y, { target: source }); // small move

          // Move loop for touch
          const steps = 10;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const cx = center.source.x + (center.target.x - center.source.x) * t;
            const cy = center.source.y + (center.target.y - center.source.y) * t;
            dispatch(document, 'touchmove', cx, cy, { target: source });
            dispatch(target, 'touchmove', cx, cy, { target: target }); // Retarget
            await new Promise(r => setTimeout(r, 20));
          }
          dispatch(target, 'touchend', center.target.x, center.target.y, { target: target });
          await new Promise(r => setTimeout(r, 200));

          // 3. Native DnD (Standard HTML5)
          log("Strategy 3: Native DnD");
          dispatch(source, 'dragstart', center.source.x, center.source.y);
          await new Promise(r => setTimeout(r, 50));
          dispatch(target, 'dragenter', center.target.x, center.target.y);
          dispatch(target, 'dragover', center.target.x, center.target.y); // Crucial
          dispatch(target, 'drop', center.target.x, center.target.y);
          dispatch(source, 'dragend', center.target.x, center.target.y);
          await new Promise(r => setTimeout(r, 200));

          // 4. Mouse Simulation (React DnD / jQuery)
          log("Strategy 4: Mouse Drag");
          dispatch(source, 'mousedown', center.source.x, center.source.y);
          await new Promise(r => setTimeout(r, 50));
          dispatch(window, 'mousemove', center.source.x + 5, center.source.y + 5); // Shake
          await new Promise(r => setTimeout(r, 50));
          dispatch(target, 'mousemove', center.target.x, center.target.y); // Snap
          // Slowly move over target
          dispatch(target, 'mouseenter', center.target.x, center.target.y);
          dispatch(target, 'mouseover', center.target.x, center.target.y);
          await new Promise(r => setTimeout(r, 100));
          dispatch(target, 'mouseup', center.target.x, center.target.y);
          dispatch(target, 'click', center.target.x, center.target.y);

          // 5. The Nuclear Option: DOM Teleportation
          // Only do this if we suspect it hasn't moved (hard to tell, calling it anyway)
          // Wait a sec to see if previous matched
          setTimeout(() => {
            log("Strategy 5: DOM Teleportation (Nuclear)");
            try {
              // Check if already moved?
              const rectNow = source.getBoundingClientRect();
              const targetRectNow = target.getBoundingClientRect();
              // Simple proximity check
              if (Math.abs(rectNow.left - targetRectNow.left) > 100) {
                // Still far away?
                if (source.parentNode) {
                  target.appendChild(source);
                  // Fire change events
                  dispatch(target, 'input', center.target.x, center.target.y);
                  dispatch(target, 'change', center.target.x, center.target.y);
                  dispatch(source, 'dragend', center.target.x, center.target.y);
                }
              }
            } catch (e) {
              console.error("Teleport failed", e);
            }

            // Cleanup
            setTimeout(() => {
              source.style.border = originalSourceBorder;
              target.style.border = originalTargetBorder;
              source.style.zIndex = "";
            }, 1000);

          }, 500);
        };

        runSequence();
      };

      let delay = 1000;

      answers.forEach(answer => {
        setTimeout(() => {
          try {
            // Check if extension context is valid
            if (!chrome.runtime?.id) {
              throw new Error("Extension context invalidated");
            }

            const parts = answer.split("->").map(s => s.trim());
            if (parts.length === 2) {
              const termText = parts[0];
              const definitionText = parts[1];

              log(`Matching "${termText.substring(0, 10)}..."`);

              // 1. Find elements
              const searchItem = findBestDomMatch(definitionText);
              const anchorItem = findBestDomMatch(termText);

              let dropTarget = null;

              if (anchorItem) {
                // Spatial Search Strategy: Find the empty box visually to the RIGHT of the anchor
                const anchorRect = anchorItem.getBoundingClientRect();
                const allElements = Array.from(document.body.querySelectorAll('*')); // Scan everything

                let bestCandidate = null;
                let minDistance = Infinity;

                // Filter for potential drop targets
                const candidates = allElements.filter(el => {
                  try {
                    // 1. Must be an element we can measure
                    if (!el || typeof el.getBoundingClientRect !== 'function') return false;

                    // 2. Must be empty (no text)
                    const text = el.innerText || el.textContent || "";
                    if (text.trim().length > 0) return false;

                    // 3. Check Dimensions (Must be box-like and SUBSTANTIAL)
                    const r = el.getBoundingClientRect();
                    if (r.width < 100 || r.height < 30) return false; // Must be big enough to be a drop bucket
                    if (r.width > 800) return false; // Too big (likely a wrapper)

                    // 4. Check Position relative to Anchor
                    // Must be to the Right
                    if (r.left <= anchorRect.right) return false;

                    // Must be Vertically Aligned (Centers are close)
                    const anchorCenterY = anchorRect.top + anchorRect.height / 2;
                    const candCenterY = r.top + r.height / 2;
                    if (Math.abs(anchorCenterY - candCenterY) > 50) return false; // Not in same row

                    return true;
                  } catch (e) {
                    return false;
                  }
                });

                // Find the closest valid candidate
                candidates.forEach(cand => {
                  const r = cand.getBoundingClientRect();
                  const distance = r.left - anchorRect.right;
                  if (distance < minDistance) {
                    minDistance = distance;
                    bestCandidate = cand;
                  }
                });

                dropTarget = bestCandidate;

                if (dropTarget) {
                  log("📍 Found Drop Target via Spatial Search");
                }
              }

              if (searchItem && dropTarget) {
                log("✅ Pairs located. Executing...");
                simulateInteraction(searchItem, dropTarget);
              } else {
                log("⚠️ Failed to locate pair.");
                if (anchorItem) anchorItem.style.border = "2px dashed orange";
              }
            }
          } catch (err) {
            if (err.message.includes("Extension context invalidated")) {
              console.log("Extension reloaded. Stopping script.");
              return;
            }
            log("ERROR: " + err.message);
            console.error(err);
          }
        }, delay);
        delay += 1500;
      });



    } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
      const inputs = container.querySelectorAll("input.fitb-input");
      inputs.forEach((input, index) => {
        if (answers[index]) {
          input.value = answers[index];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    } else {
      const choices = container.querySelectorAll(
        'input[type="radio"], input[type="checkbox"]'
      );

      choices.forEach((choice) => {
        const label = choice.closest("label");
        if (label) {
          const choiceText = label
            .querySelector(".choiceText")
            ?.textContent.trim();
          if (choiceText) {
            const shouldBeSelected = answers.some((ans) => {
              if (choiceText === ans) return true;

              const choiceWithoutPeriod = choiceText.replace(/\.$/, "");
              const answerWithoutPeriod = ans.replace(/\.$/, "");
              if (choiceWithoutPeriod === answerWithoutPeriod) return true;

              if (choiceText === ans + ".") return true;

              return false;
            });

            if (shouldBeSelected) {
              choice.click();
            }
          }
        }
      });
    }

    if (isAutomating) {
      // 1. Calculate wait time dynamically
      let waitTime = 1000; // Default fast wait for normal questions

      const container = document.querySelector(".probe-container");
      if (container && container.querySelector(".awd-probe-type-matching")) {
        // Only wait long if it's a matching question
        waitTime = (Array.isArray(answers) ? answers.length : 1) * 1500 + 3000;
      }

      console.log(`Waiting ${waitTime}ms for interactions to complete...`);

      setTimeout(() => {
        // 2. Try to find the button (enabled OR disabled)
        waitForElement('[data-automation-id="confidence-buttons--high_confidence"]', 5000)
          .then((button) => {
            // 3. FORCE ENABLE if needed
            if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
              console.log("⚠️ Button disabled. Forcing enable...");
              button.disabled = false;
              button.removeAttribute('disabled');
              button.setAttribute('aria-disabled', 'false');
              button.classList.remove('disabled');
              button.style.pointerEvents = 'auto';
              button.style.opacity = '1';
            }

            // 4. Click
            button.click();
            // Double tap for good luck
            setTimeout(() => button.click(), 100);

            return button;
          })
          .then((button) => {

            setTimeout(() => {
              // Cleanup Debug Log
              const debugLog = document.getElementById('racoon-debug-log');
              if (debugLog) debugLog.remove();

              const incorrectMarker = container.querySelector(
                ".awd-probe-correctness.incorrect"
              );
              if (incorrectMarker) {
                const correctionData = extractCorrectAnswer();
                if (correctionData && correctionData.answer) {
                  lastIncorrectQuestion = correctionData.question;
                  lastCorrectAnswer = cleanAnswer(correctionData.answer);
                  console.log(
                    "Found incorrect answer. Correct answer is:",
                    lastCorrectAnswer
                  );
                }
              }

              waitForElement(".next-button", 10000)
                .then((nextButton) => {
                  nextButton.click();
                  setTimeout(() => {
                    checkForNextStep();
                  }, 1000);
                })
                .catch((error) => {
                  console.error("Automation error:", error);
                  isAutomating = false;
                });
            }, 1000);
          })
          .catch((error) => {
            console.error("Automation error:", error);
            isAutomating = false;
          });
      }, waitTime);
    }
  } catch (e) {
    console.error("Error processing response:", e);
  }
}

function addAssistantButton() {
  const buttonContainer = document.createElement("div");
  buttonContainer.id = "catari-control-panel";
  buttonContainer.style.position = "fixed";
  buttonContainer.style.bottom = "20px";
  buttonContainer.style.right = "20px";
  buttonContainer.style.zIndex = "9999";
  buttonContainer.style.display = "flex";
  buttonContainer.style.alignItems = "center";
  buttonContainer.style.backgroundColor = "#ffffff";
  buttonContainer.style.borderRadius = "50px";
  buttonContainer.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
  buttonContainer.style.padding = "5px";
  buttonContainer.style.transition = "all 0.3s ease";
  buttonContainer.style.fontFamily = "sans-serif";

  // Hover effect
  buttonContainer.addEventListener("mouseenter", () => {
    buttonContainer.style.transform = "translateY(-2px)";
    buttonContainer.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
  });
  buttonContainer.addEventListener("mouseleave", () => {
    buttonContainer.style.transform = "translateY(0)";
    buttonContainer.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
  });

  chrome.storage.sync.get("aiModel", function (data) {
    const aiModel = data.aiModel || "chatgpt";
    let modelName = "ChatGPT";

    if (aiModel === "gemini") {
      modelName = "Gemini";
    } else if (aiModel === "deepseek") {
      modelName = "DeepSeek";
    }

    const btn = document.createElement("button");
    btn.textContent = `Start ${modelName}`;
    btn.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.borderRadius = "20px";
    btn.style.padding = "10px 20px";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "600";
    btn.style.cursor = "pointer";
    btn.style.marginRight = "8px";
    btn.style.transition = "opacity 0.2s";

    btn.addEventListener("click", () => {
      if (isAutomating) {
        isAutomating = false;
        chrome.storage.sync.get("aiModel", function (data) {
          const currentModel = data.aiModel || "chatgpt";
          let currentModelName = "ChatGPT";

          if (currentModel === "gemini") {
            currentModelName = "Gemini";
          } else if (currentModel === "deepseek") {
            currentModelName = "DeepSeek";
          }

          btn.textContent = `Start ${currentModelName}`;
          btn.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
        });
      } else {
        const proceed = confirm(
          "Ready to let the raccoon take over? Click OK to start."
        );
        if (proceed) {
          isAutomating = true;
          btn.textContent = "Stop";
          btn.style.background = "#ff4757";
          checkForNextStep();
        }
      }
    });

    const settingsBtn = document.createElement("button");
    settingsBtn.title = "Settings";
    settingsBtn.style.background = "transparent";
    settingsBtn.style.border = "none";
    settingsBtn.style.cursor = "pointer";
    settingsBtn.style.padding = "8px";
    settingsBtn.style.borderRadius = "50%";
    settingsBtn.style.display = "flex";
    settingsBtn.style.alignItems = "center";
    settingsBtn.style.justifyContent = "center";
    settingsBtn.style.color = "#4a5568";

    settingsBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    `;

    settingsBtn.addEventListener("mouseenter", () => {
      settingsBtn.style.backgroundColor = "#edf2f7";
    });
    settingsBtn.addEventListener("mouseleave", () => {
      settingsBtn.style.backgroundColor = "transparent";
    });

    settingsBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openSettings" });
    });

    buttonContainer.appendChild(btn);
    buttonContainer.appendChild(settingsBtn);
    document.body.appendChild(buttonContainer);

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.aiModel) {
        const newModel = changes.aiModel.newValue;
        let newModelName = "ChatGPT";

        if (newModel === "gemini") {
          newModelName = "Gemini";
        } else if (newModel === "deepseek") {
          newModelName = "DeepSeek";
        }

        if (!isAutomating) {
          btn.textContent = `Start ${newModelName}`;
        }
      }
    });
  });
}

function parseQuestion() {
  const container = document.querySelector(".probe-container");
  if (!container) {
    alert("No question found on the page.");
    return null;
  }

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const uiSpans = promptClone.querySelectorAll(
      "span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    uiSpans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      if (input.parentNode) {
        input.parentNode.replaceChild(blankMarker, input);
      }
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let options = [];
  if (questionType === "matching") {
    const prompts = Array.from(
      container.querySelectorAll(".match-prompt .content")
    ).map((el) => el.textContent.trim());
    const choices = Array.from(
      container.querySelectorAll(".choices-container .content")
    ).map((el) => el.textContent.trim());
    options = { prompts, choices };
  } else if (questionType !== "fill_in_the_blank") {
    container.querySelectorAll(".choiceText").forEach((el) => {
      options.push(el.textContent.trim());
    });
  }

  return {
    type: questionType,
    question: questionText,
    options: options,
    previousCorrection: lastIncorrectQuestion
      ? {
        question: lastIncorrectQuestion,
        correctAnswer: lastCorrectAnswer,
      }
      : null,
  };
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error("Element not found: " + selector));
      }
    }, 100);
  });
}

setupMessageListener();
addAssistantButton();

if (isAutomating) {
  setTimeout(() => {
    checkForNextStep();
  }, 1000);
}
