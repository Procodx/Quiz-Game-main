const socket = io("http://localhost:3000");
let currentRoom = null;

socket.on("startGame", ({ room, questions }) => {
  // Start the quiz for both players
  currentRoom = room; // Save the room ID for sending answers
  quiz.data = questions; //set the questions from the server
  quiz.currentQ = 0; //reset the current question index
  quiz.userAnswers = []; //reset the user answers
  //hide waiting message and show the quiz
  quiz.elements.waiting.style.display = "none";
  quiz.elements.quiz.style.display = "block";
  //fetch questions for the quiz
  quiz.showQuestion();
});

function sendAnswer(answer) {
  if (currentRoom) {
    socket.emit("answer", { room: currentRoom, answer });
  }
}
socket.on("playerAnswered", ({ playerId, answer }) => {
  //check if the answer is correct
  const correctAnswer = quiz.data[quiz.currentQ].correct_answer;
  const isCorrect = answer === correctAnswer;
  //show who answered and if they were correct
  let message = "";
  if (playerId === socket.id) {
    message = isCorrect
      ? "You answered first and you were correct!"
      : "You answered first, but it was wrong.";
    // Optionally, save the answer for your score
    quiz.userAnswers[quiz.currentQ] = answer;
  } else {
    message = isCorrect
      ? "Opponent answered first and was correct."
      : "Opponent answered first, but was wrong.";
  }
  //show the result in the choices area
  quiz.elements.choices.innerHTML = `<div class="choice">${message}</div>`;

  //Auto move to the next question
  setTimeout(() => {
    if (quiz.currentQ < quiz.data.length - 1) {
      quiz.navigate(1);
    } else {
      quiz.showResults();
    }
  }, 2000);
});

socket.on("finalScores", (scores) => {
  // scores is an object: { [player1Id]: score1, [player2Id]: score2 }
  const myScore = scores[socket.id];
  // Get opponent's ID and score
  const opponentId = Object.keys(scores).find((id) => id !== socket.id);
  const opponentScore = scores[opponentId];

  let resultMessage = "";
  if (myScore > opponentScore) {
    resultMessage = "You win! 🎉";
  } else if (myScore < opponentScore) {
    resultMessage = "You lose! 😢";
  } else {
    resultMessage = "It's a tie!";
  }

  quiz.elements.quiz.innerHTML = `
        <div id="results">
            <h2>Quiz Complete!</h2>
            <p>Your score: ${myScore}</p>
            <p>Opponent's score: ${opponentScore}</p>
            <h3>${resultMessage}</h3>
            <button id="restart" onclick="location.reload()">Try Again</button>
        </div>
    `;
});

socket.on("opponentDisconnected", () => {
  quiz.elements.quiz.innerHTML = `
        <div id="results">
            <h2>Opponent disconnected.</h2>
            <button id="restart" onclick="location.reload()">Try Again</button>
        </div>
    `;
});

const quiz = {
  data: [],
  currentQ: 0,
  userAnswers: [],
  elements: {
    waiting: document.getElementById("waiting"),
    categorySelection: document.getElementById("category-selection"),
    categorySelect: document.getElementById("category-select"),
    startButton: document.getElementById("start-quiz"),
    question: document.getElementById("question"),
    choices: document.getElementById("choices"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    quiz: document.getElementById("quiz"),
  },
  decodeHTML: (html) =>
    new DOMParser().parseFromString(html, "text/html").body.textContent || html,

  init() {
    this.elements.categorySelect.addEventListener("change", () => {
      this.elements.startButton.disabled = !this.elements.categorySelect.value;
    });

    this.elements.startButton.addEventListener("click", () => {
      if (this.elements.categorySelect.value) {
        //hide the category selection and show the waiting message
        this.elements.categorySelection.style.display = "none";
        this.elements.waiting.style.display = "block";
        //save the selected category but dont fetch the questions yet
        this.selectedCategory = this.elements.categorySelect.value;
        socket.emit("findMatch", { category: this.selectedCategory });
      }
    });

    this.elements.prev.addEventListener("click", () => this.navigate(-1));
    this.elements.next.addEventListener("click", () =>
      this.currentQ === this.data.length - 1
        ? this.showResults()
        : this.navigate(1)
    );
  },

  // async fetchQuestions(category) {
  //   const apiUrl = `https://opentdb.com/api.php?amount=10&category=${category}&type=multiple`;
  //   try {
  //     const res = await fetch(apiUrl);
  //     const data = await res.json();
  //     this.data = data.results;
  //     this.showQuestion();
  //   } catch (error) {
  //     alert("Failed to load questions. Please try again later.");
  //     console.error("Error fetching questions:", error);
  //   }
  // },

  selectCategory(category) {
    this.elements.categorySelection.style.display = "none";
    this.elements.quiz.style.display = "block";
    this.fetchQuestions(category);
  },
  showQuestion() {
    const current = this.data[this.currentQ];
    if (!current) {
      console.warn("No question data available at index", this.currentQ);
      return;
    }
  
    const { question } = current;
    this.elements.question.textContent = this.decodeHTML(question);
  
    const options = current.options;
    this.elements.choices.innerHTML = options
      .map(answer => `<div class="choice" onclick="quiz.selectAnswer('${answer.replace(/'/g, "\\'")}')">
          ${this.decodeHTML(answer)}
      </div>`).join('');
  
    this.elements.prev.disabled = this.currentQ === 0;
    this.elements.next.textContent =
      this.currentQ === this.data.length - 1 ? "Finish" : "Next";
    this.highlightSelected();
  },

  selectAnswer(answer) {
    //send the answer to the server when you click on an answer
    if (this.hasAnswered) return;
    this.hasAnswered = true;
    sendAnswer(answer);
    this.elements.choices.innerHTML =
      '<div class="choice" id="waiting-for-result">Waiting for result...</div>';
    //const decodedAnswer = this.decodeHTML(answer);
    // this.userAnswers[this.currentQ] = decodedAnswer;
    this.highlightSelected();

    // event.currentTarget.classList.add('selected-click');
    // setTimeout(() => {
    //   event.currentTarget.classList.remove("selected-click");
    // }, 200);
  },

  highlightSelected() {
    document.querySelectorAll(".choice").forEach((choice) => {
      const isSelected =
        this.userAnswers[this.currentQ] === choice.textContent.trim();
      choice.classList.toggle("selected", isSelected);

      if (isSelected) {
        choice.style.transform = "none";
      }
    });
  },

  navigate(direction) {
    this.currentQ += direction;
    this.hasAnswered = false; //Reset before moving to next
    this.showQuestion();
  },

  showResults() {
    const score = this.data.reduce(
      (acc, q, i) => acc + (this.userAnswers[i] === q.correct_answer),
      0
    );
    // Send your score to the server
    socket.emit("submitScore", { room: currentRoom, score });
    // Show a waiting message until both scores are received
    this.elements.quiz.innerHTML = `<div id="results"><h2>Waiting for opponent's score...</h2></div>`;
    let resultsHTML = `
       <div id="results">
           <h2>Quiz Complete!</h2>
           <p id="score">You got ${score} out of ${this.data.length} correct</p>
           <div id="question-review">
    `;

    this.data.forEach((question, index) => {
      const userAnswer = this.userAnswers[index] || "Not answered";
      const isCorrect = userAnswer === this.decodeHTML(question.correct_answer);

      resultsHTML += `
                <div class="review-item ${isCorrect ? "correct" : "incorrect"}">
                    <h3>Question ${index + 1}: ${this.decodeHTML(
        question.question
      )}</h3>
                    <p class="user-answer">Your answer: ${this.decodeHTML(
                      userAnswer
                    )}</p>
                    ${
                      !isCorrect
                        ? `<p class="correct-answer">Correct answer: ${this.decodeHTML(
                            question.correct_answer
                          )}</p>`
                        : ""
                    }
                </div>
            `;
    });

    resultsHTML += `
                </div>
                <button id="restart" onclick="location.reload()">Try Again</button>
            </div>
        `;

    this.elements.quiz.innerHTML = resultsHTML;
  },
};

quiz.init();
