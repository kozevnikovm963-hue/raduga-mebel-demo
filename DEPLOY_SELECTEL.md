# Развёртывание KORPUS на Selectel

Эта инструкция подготавливает сайт для проверки по IP `135.106.180.226`. Она **не переключает домен**, не меняет DNS, не удаляет и не отключает старый сайт на Tilda и не выпускает HTTPS-сертификат.

## Как устроен запуск

- Next.js собирает статический frontend в `/var/www/korpus/out`.
- Nginx отдаёт страницы, изображения, шрифты, CSS и JavaScript из этой папки.
- Отдельный Node.js backend принимает форму на `127.0.0.1:3000`.
- Nginx передаёт запросы `/api/application` и `/api/health` на backend.
- Порт `3000` остаётся доступен только внутри сервера. Открывать его в UFW не нужно.
- Docker и база данных для текущей задачи не используются.

## 1. Сначала загрузить изменения в GitHub

На своём компьютере откройте PowerShell в папке проекта:

```powershell
cd "C:\Users\user\Desktop\2\-New-main\korpus-demo"
git status
git add .
git commit -m "Prepare KORPUS for Selectel deployment"
git push origin main
```

Перед `git add` убедитесь, что в папке нет настоящего файла `.env`. Он исключён через `.gitignore`, а пароли и токены нельзя добавлять в GitHub.

## 2. Подключиться к серверу

```powershell
ssh root@135.106.180.226
```

Пароль сервера вводится только в запрос SSH. Не записывайте его в проект или команды.

## 3. Установить Git и Node.js

На сервере выполните:

```bash
apt update
apt install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version
```

Нужен Node.js не ниже `22.13.0`.

## 4. Создать отдельного пользователя и каталог

```bash
adduser --system --group --home /var/www/korpus --shell /usr/sbin/nologin korpus
install -d -o korpus -g korpus -m 750 /var/www/korpus
```

Если пользователь `korpus` уже существует, сообщение об этом можно пропустить. Затем загрузите проект:

```bash
sudo -u korpus git clone https://github.com/kozevnikovm963-hue/raduga-mebel-demo.git /var/www/korpus
cd /var/www/korpus
```

Если каталог уже содержит ранее загруженный Git-проект, вместо `git clone` выполните:

```bash
cd /var/www/korpus
sudo -u korpus git pull --ff-only origin main
```

## 5. Создать серверный `.env`

```bash
install -o korpus -g korpus -m 600 /var/www/korpus/.env.example /var/www/korpus/.env
nano /var/www/korpus/.env
```

В файле уже есть несекретные настройки. Вручную заполните только значения после знака `=`:

```env
VK_TOKEN=ВСТАВИТЬ_ТОКЕН_СООБЩЕСТВА_VK
VK_RECEIVER_ID=ВСТАВИТЬ_ID_ПОЛУЧАТЕЛЯ_ИЛИ_ДИАЛОГА
SMTP_PASSWORD=ВСТАВИТЬ_ПАРОЛЬ_ПРИЛОЖЕНИЯ_MAIL_RU
```

Дополнительно проверьте, что в `.env` сохранены эти строки:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
NEXT_PUBLIC_FORM_ENDPOINT=/api/application
VK_GROUP_ID=169502771
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=korpusm2010@mail.ru
MAIL_FROM=korpusm2010@mail.ru
MAIL_TO=korpusm2010@mail.ru
```

Для Mail.ru нужен отдельный пароль приложения, а не пароль от почтового ящика. После сохранения ещё раз ограничьте доступ к файлу:

```bash
chown korpus:korpus /var/www/korpus/.env
chmod 600 /var/www/korpus/.env
```

## 6. Установить зависимости и собрать проект

```bash
cd /var/www/korpus
sudo -u korpus npm ci
sudo -u korpus npm run build:selectel
```

Команда создаёт:

- `/var/www/korpus/out` — готовый frontend;
- `/var/www/korpus/dist-server/index.mjs` — готовый backend.

Если на сервере не хватает памяти именно во время сборки, повторите только сборку с ограничением памяти Node.js:

```bash
sudo -u korpus env NODE_OPTIONS=--max-old-space-size=1536 npm run build:selectel
```

## 7. Подключить systemd-службу backend

```bash
install -m 644 /var/www/korpus/deploy/korpus-backend.service /etc/systemd/system/korpus-backend.service
systemctl daemon-reload
systemctl enable --now korpus-backend
systemctl status korpus-backend --no-pager
```

Проверьте backend внутри сервера:

```bash
curl http://127.0.0.1:3000/api/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

Не выполняйте `ufw allow 3000`: Nginx обращается к backend локально, внешний доступ к этому порту не нужен.

## 8. Подключить конфигурацию Nginx

```bash
install -m 644 /var/www/korpus/deploy/nginx-korpus.conf /etc/nginx/sites-available/korpus
ln -s /etc/nginx/sites-available/korpus /etc/nginx/sites-enabled/korpus
nginx -t
systemctl reload nginx
```

Если ссылка уже существует, команда `ln` сообщит об этом — повторно создавать её не нужно. Важно: `nginx -t` должен завершиться успешно до перезагрузки Nginx.

## 9. Проверить сайт по IP

На сервере:

```bash
curl -I http://135.106.180.226/
curl http://135.106.180.226/api/health
```

Затем откройте в браузере:

```text
http://135.106.180.226/
```

Также напрямую проверьте страницу политики:

```text
http://135.106.180.226/privacy/
```

## 10. Проверить отправку формы

Сначала отправьте тестовую заявку через форму на сайте. Проверьте, что она появилась хотя бы в одном канале — VK или почте. Если один канал временно недоступен, успешная отправка через второй всё равно считается успешной.

Для проверки из терминала без фотографии:

```bash
curl -X POST http://135.106.180.226/api/application \
  -F 'name=Тест' \
  -F 'phone=+7 999 000-00-00' \
  -F 'furnitureType=Кухня' \
  -F 'comment=Тестовая заявка с Selectel'
```

Для проверки с фотографией замените путь на путь к реальному тестовому файлу JPG, PNG или WEBP:

```bash
curl -X POST http://135.106.180.226/api/application \
  -F 'name=Тест' \
  -F 'phone=+7 999 000-00-00' \
  -F 'furnitureType=Шкаф' \
  -F 'comment=Тестовая заявка с фотографией' \
  -F 'photos=@/ПУТЬ/К/ТЕСТОВОМУ_ФОТО.jpg;type=image/jpeg'
```

Разрешено до 5 фотографий, каждая не больше 10 МБ, форматы JPG, JPEG, PNG и WEBP.

## 11. Посмотреть логи

Последние сообщения backend:

```bash
journalctl -u korpus-backend -n 100 --no-pager
```

Следить за новыми сообщениями:

```bash
journalctl -u korpus-backend -f
```

Логи Nginx:

```bash
tail -n 100 /var/log/nginx/error.log
tail -n 100 /var/log/nginx/access.log
```

Секреты в логи не выводятся.

## 12. Перезапустить сайт

Backend:

```bash
systemctl restart korpus-backend
systemctl status korpus-backend --no-pager
```

Nginx после изменения конфигурации:

```bash
nginx -t && systemctl reload nginx
```

## 13. Установить будущие обновления

```bash
cd /var/www/korpus
sudo -u korpus git pull --ff-only origin main
sudo -u korpus npm ci
sudo -u korpus npm run build:selectel
systemctl restart korpus-backend
nginx -t && systemctl reload nginx
```

## 14. Откатить код при ошибке

Посмотрите несколько последних версий:

```bash
cd /var/www/korpus
sudo -u korpus git log --oneline -5
```

Выберите хеш рабочей версии и временно переключитесь на неё:

```bash
sudo -u korpus git switch --detach ВСТАВИТЬ_ХЕШ_РАБОЧЕЙ_ВЕРСИИ
sudo -u korpus npm ci
sudo -u korpus npm run build:selectel
systemctl restart korpus-backend
nginx -t && systemctl reload nginx
```

Чтобы позже вернуться на актуальную ветку:

```bash
sudo -u korpus git switch main
sudo -u korpus git pull --ff-only origin main
```

Файл `/var/www/korpus/.env` при переключении Git-версий сохраняется, потому что он не отслеживается Git.

## 15. Позже подключить домен и HTTPS

Этот раздел выполняйте **только после отдельного решения переключить домен**. До этого момента не меняйте DNS и не запускайте Certbot.

Когда новый сайт окончательно проверен по IP:

1. Измените DNS-запись домена `мебелькиров43.рф` на IP `135.106.180.226` у регистратора. Старый сайт на Tilda не удаляйте — он останется вариантом для отката.
2. Дождитесь обновления DNS и проверьте, что домен указывает на новый IP.
3. В `/etc/nginx/sites-available/korpus` замените строку `server_name` на:

```nginx
server_name xn--43-9kcenbvpig2ax7m.xn--p1ai;
```

4. Проверьте и перечитайте конфигурацию:

```bash
nginx -t && systemctl reload nginx
```

5. Только после успешной проверки домена установите Certbot и выпустите сертификат:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d xn--43-9kcenbvpig2ax7m.xn--p1ai
```

6. Проверьте автоматическое продление:

```bash
certbot renew --dry-run
```

До отдельного подтверждения шаги этого раздела выполнять не нужно.
