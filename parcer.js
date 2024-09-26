function scrapeGeniusByContent() {
  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/your_spreadsheet_id/edit'; // Замените на вашу ссылку
  const sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  const keywordsSheet = sheet.getSheetByName('Keywords');
  const resultsSheet = sheet.getSheetByName('Results');

  const existingLinks = resultsSheet.getRange('A2:A').getValues().flat().filter(link => link !== '');
  const keywords = keywordsSheet.getRange('A2:A').getValues().flat().filter(kw => kw !== '');
  const baseUrl = 'https://genius.com/api/search/';
  const apiKey = 'e3F9lRJXdUjem0h3LlDmolN8ldhJ3H3xYQaDaPpDpIIKfqiCNz00vkcAM34rDhqF';  // Замените на ваш ключ API Genius

  keywords.forEach(keyword => {
    let page = 1;
    let hasMoreResults = true;

    while (hasMoreResults) {
      const searchUrl = `${baseUrl}?q=${encodeURIComponent(keyword)}&page=${page}`;
      const searchResponse = UrlFetchApp.fetch(searchUrl, {
        'headers': {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const searchData = JSON.parse(searchResponse.getContentText());
      const hits = searchData.response.hits;

      if (hits.length === 0) {
        hasMoreResults = false;  // Выход из цикла, если больше нет результатов
      } else {
        hits.forEach(hit => {
          const articleUrl = hit.result.url;
          const articleTitle = hit.result.title;
          const artistName = hit.result.primary_artist.name;

          if (!existingLinks.includes(articleUrl)) {
            const articleResponse = UrlFetchApp.fetch(articleUrl);
            const htmlContent = articleResponse.getContentText();

            // Ищем текст в div'ах с классом, содержащим 'Lyrics__Container'
            const lyricsRegex = /<div[^>]*class="[^"]*Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
            const foundSentences = new Set(); // Используем Set для исключения дубликатов
            const foundSentenceNumbers = [];
            let match;
            let sentenceCount = 0; // Для нумерации предложений без скобок и пустых

            while ((match = lyricsRegex.exec(htmlContent)) !== null) {
              let lyricsText = match[1].replace(/<(?!(br\s*\/?))[^\>]+>/g, '').trim();
              
              // Удаляем текст внутри квадратных скобок
              lyricsText = lyricsText.replace(/\[.*?\]/g, '');

              // Разделяем текст по тегу <br>
              const sentences = lyricsText.split(/<br\s*\/?>/).map(sentence => sentence.trim());

              sentences.forEach(sentence => {
                // Проверяем, что предложение не пустое и не содержит только пробелы
                if (sentence !== '') {
                  sentenceCount++; // Увеличиваем счетчик предложений

                  // Проверяем, содержит ли предложение ключевое слово
                  if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
                    foundSentences.add(sentence.replace(/&quot;/g, '"')); // Заменяем &quot; на "
                    foundSentenceNumbers.push(sentenceCount); // Сохраняем корректный номер предложения
                  }
                }
              });
            }

            if (foundSentences.size > 0) {
              // Проверяем последнюю строку на наличие неполных данных
              const lastRow = resultsSheet.getLastRow();
              let startRow = lastRow;
              
              // Проверяем, все ли ячейки последней строки заполнены
              const rowValues = resultsSheet.getRange(lastRow, 1, 1, 8).getValues()[0];
              const isRowComplete = rowValues.every(value => value !== '');

              if (!isRowComplete) {
                startRow = lastRow;  // Продолжаем заполнение с неполной строки
              } else {
                startRow = lastRow + 1;  // Начинаем с новой строки
              }

              let albumInfo = 'Альбом неизвестен';
              const albumRegex = /<div class="PrimaryAlbum__AlbumDetails-cuci8p-3[^>]*>.*?<a[^>]*>(.*?)<\/a>/;
              const albumMatch = htmlContent.match(albumRegex);
              if (albumMatch && albumMatch[1]) {
                albumInfo = albumMatch[1].replace(/<!--.*?-->/g, '').trim();
              }

              let releaseDate = 'Дата неизвестна';
              const dateRegex = /<span class="LabelWithIcon__Label-hjli77-1 hgsvkF">(.*?)<\/span>/;
              const dateMatch = htmlContent.match(dateRegex);
              if (dateMatch && dateMatch[1]) {
                releaseDate = dateMatch[1].trim();
                
                if (releaseDate.includes('viewer')) {
                  releaseDate = 'Дата неизвестна';
                }
              }

              resultsSheet.getRange(startRow, 1).setValue(articleUrl);
              resultsSheet.getRange(startRow, 2).setValue(artistName);
              resultsSheet.getRange(startRow, 3).setValue(articleTitle);
              resultsSheet.getRange(startRow, 4).setValue(keyword);
              resultsSheet.getRange(startRow, 5).setValue(albumInfo);
              resultsSheet.getRange(startRow, 6).setValue(releaseDate);

              // Преобразуем Set в массив, чтобы записать уникальные предложения в ячейку
              const uniqueSentences = Array.from(foundSentences).join('\n'); // Уникальные предложения
              resultsSheet.getRange(startRow, 7).setValue(uniqueSentences);

              // Записываем номера предложений с ключевым словом
              const sentenceNumbersText = foundSentenceNumbers.join(', ');
              resultsSheet.getRange(startRow, 8).setValue(sentenceNumbersText);
            }
            existingLinks.push(articleUrl);
          }
        });
        page++;  // Переход к следующей странице
      }
    }
  });
}
