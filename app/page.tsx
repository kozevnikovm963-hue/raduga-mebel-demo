"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

const projects = [
  { src: "/images/kitchen-04.jpg", title: "Кухня с островом", tone: "Серый · дуб", size: "large" },
  { src: "/images/kitchen-01.jpg", title: "Лаконичная кухня", tone: "Белый · орех", size: "standard" },
  { src: "/images/kitchen-03.jpg", title: "Светлая кухня", tone: "Белый · дерево", size: "standard" },
  { src: "/images/kitchen-02.jpg", title: "Кухня в классике", tone: "Серый · латунь", size: "tall" },
  { src: "/images/kitchen-06.jpg", title: "Компактная кухня", tone: "Серый · чёрный", size: "standard" },
  { src: "/images/kitchen-07.jpg", title: "Графичная кухня", tone: "Антрацит · белый", size: "wide" },
];

const categories = [
  ["01", "Кухни", "Пространство, где всё на своём месте"],
  ["02", "Шкафы", "Встроенные и корпусные решения"],
  ["03", "Гардеробные", "Продуманное хранение без компромиссов"],
  ["04", "Прихожие", "Первое впечатление о доме"],
  ["05", "Детские", "Мебель, которая растёт вместе с семьёй"],
  ["06", "ТВ-зоны", "Чистая геометрия и порядок"],
];

const steps = [
  ["01", "Знакомство", "Обсуждаем задачу, стиль и ориентир по бюджету."],
  ["02", "Замер", "Специалист выезжает, фиксирует размеры и особенности помещения."],
  ["03", "Проект", "Разрабатываем индивидуальное решение и подбираем материалы."],
  ["04", "Производство", "Изготавливаем мебель на собственном производстве."],
  ["05", "Монтаж", "Собираем и устанавливаем мебель. Монтаж — бесплатно."],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.body.style.overflow = activeImage ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeImage]);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Korpus — наверх">
          <span className="brand-mark">K</span>
          <span>KORPUS</span>
        </a>
        <nav className={menuOpen ? "nav open" : "nav"} aria-label="Основная навигация">
          <a href="#works" onClick={() => setMenuOpen(false)}>Проекты</a>
          <a href="#categories" onClick={() => setMenuOpen(false)}>Мебель</a>
          <a href="#process" onClick={() => setMenuOpen(false)}>Как работаем</a>
          <a href="#contacts" onClick={() => setMenuOpen(false)}>Контакты</a>
        </nav>
        <div className="header-actions">
          <a className="phone" href="tel:+79536770348">+7 953 677-03-48</a>
          <a className="header-cta" href="#calc">Рассчитать</a>
          <button
            className="menu-button"
            type="button"
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-photo">
          <Image
            src="/images/kitchen-04.jpg"
            alt="Кухня с островом, выполненная мебельной студией Korpus"
            fill
            priority
            sizes="100vw"
          />
          <div className="hero-shade" />
        </div>
        <div className="hero-content">
          <div className="eyebrow light"><span /> Мебельная студия · Киров</div>
          <h1>Мебель,<br />созданная для<br /><em>вашего пространства</em></h1>
          <p>Индивидуальное проектирование и собственное производство корпусной мебели с 2006 года.</p>
          <div className="hero-buttons">
            <a className="button button-light" href="#calc">Рассчитать стоимость <span>↗</span></a>
            <a className="text-link light-link" href="#works">Смотреть проекты <span>↓</span></a>
          </div>
        </div>
        <div className="hero-meta">
          <span>43°36′ с. ш.</span>
          <span>Киров</span>
        </div>
        <div className="hero-counter">
          <strong>с 2006</strong>
          <span>создаём мебель<br />по вашим размерам</span>
        </div>
      </section>

      <section className="intro section-pad">
        <div className="eyebrow"><span /> О студии</div>
        <div className="intro-copy">
          <p className="lead">Мы проектируем мебель не отдельно от интерьера, а как его естественное продолжение.</p>
          <div className="intro-details">
            <p>Учитываем размеры, привычки, цветовую гамму и бюджет — чтобы каждый сантиметр пространства работал на вас.</p>
            <a className="text-link" href="#process">Как мы работаем <span>↘</span></a>
          </div>
        </div>
        <div className="proof-grid">
          <div><strong>2006</strong><span>год основания</span></div>
          <div><strong>100%</strong><span>индивидуальный проект</span></div>
          <div><strong>0₽</strong><span>монтаж мебели</span></div>
          <div><strong>5</strong><span>этапов до результата</span></div>
        </div>
      </section>

      <section className="works section-pad" id="works">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> Выполненные проекты</div>
            <h2>Реальные интерьеры.<br /><em>Реальные детали.</em></h2>
          </div>
          <p>Нажмите на фотографию,<br />чтобы рассмотреть проект.</p>
        </div>
        <div className="project-grid">
          {projects.map((project, index) => (
            <button
              className={`project-card ${project.size}`}
              key={project.src}
              type="button"
              onClick={() => setActiveImage(project.src)}
              aria-label={`Открыть проект: ${project.title}`}
            >
              <Image
                src={project.src}
                alt={`${project.title}, работа Korpus`}
                fill
                sizes="(max-width: 700px) 100vw, 50vw"
              />
              <span className="project-index">0{index + 1}</span>
              <span className="project-caption">
                <strong>{project.title}</strong>
                <small>{project.tone}</small>
              </span>
              <span className="project-open">↗</span>
            </button>
          ))}
        </div>
        <a className="button button-dark centered" href="https://vk.ru/ms_korpus" target="_blank" rel="noreferrer">
          Больше работ в VK <span>↗</span>
        </a>
      </section>

      <section className="categories section-pad" id="categories">
        <div className="section-heading compact">
          <div>
            <div className="eyebrow light"><span /> Направления</div>
            <h2>Мебель для<br /><em>всего дома</em></h2>
          </div>
          <p>От одной тумбы до комплексного<br />решения для нескольких комнат.</p>
        </div>
        <div className="category-list">
          {categories.map(([number, title, description]) => (
            <a className="category-row" href="#calc" key={number}>
              <span className="category-number">{number}</span>
              <strong>{title}</strong>
              <span className="category-description">{description}</span>
              <span className="category-arrow">↗</span>
            </a>
          ))}
        </div>
      </section>

      <section className="feature">
        <div className="feature-photo">
          <Image src="/images/kitchen-03.jpg" alt="Светлая кухня Korpus" fill sizes="60vw" />
        </div>
        <div className="feature-copy">
          <div className="eyebrow"><span /> Подход</div>
          <h2>Не просто мебель.<br /><em>Точное решение.</em></h2>
          <p>Подбираем материалы и комплектацию под задачу и бюджет. Работаем с фурнитурой BLUM, HETTICH, BOYARD, FIRMAX, GRATTIS и других производителей.</p>
          <ul>
            <li><span>01</span> Собственное производство</li>
            <li><span>02</span> Проекты любой сложности</li>
            <li><span>03</span> Заключение договора</li>
            <li><span>04</span> Рассрочка от производителя</li>
          </ul>
        </div>
      </section>

      <section className="process section-pad" id="process">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> Путь проекта</div>
            <h2>От первой идеи<br /><em>до установки</em></h2>
          </div>
          <p>Понятный процесс, в котором<br />вы всегда знаете следующий шаг.</p>
        </div>
        <div className="steps">
          {steps.map(([number, title, description]) => (
            <article className="step" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="review-section section-pad">
        <div className="review-quote">“</div>
        <blockquote>
          Второй раз заказываю мебель здесь. Кухню установили раньше, чем ожидалось — всё отлично. Спасибо за добросовестную работу и индивидуальный подход в подборе материалов.
        </blockquote>
        <div className="review-author">
          <span>Евгения Ф.</span>
          <span>Отзыв клиента · VK</span>
        </div>
        <a className="text-link" href="https://vk.ru/topic-169502771_39371654" target="_blank" rel="noreferrer">
          Читать все отзывы <span>↗</span>
        </a>
      </section>

      <section className="calc" id="calc">
        <div className="calc-visual">
          <Image src="/images/kitchen-02.jpg" alt="Проект кухни Korpus" fill sizes="50vw" />
          <div className="calc-visual-copy">
            <div className="eyebrow light"><span /> Первый шаг</div>
            <h2>Расскажите,<br />что вы задумали</h2>
            <p>Можно приложить фото помещения, эскиз или пример понравившегося интерьера.</p>
          </div>
        </div>
        <div className="calc-form-wrap">
          {sent ? (
            <div className="success-message" role="status">
              <span>✓</span>
              <h3>Спасибо!</h3>
              <p>Это демонстрационная форма. На готовом сайте заявка будет поступать менеджеру KORPUS.</p>
              <button type="button" onClick={() => setSent(false)}>Заполнить ещё раз</button>
            </div>
          ) : (
            <form onSubmit={submitForm}>
              <div className="form-heading">
                <span>Заявка на расчёт</span>
                <small>Ответим и уточним детали</small>
              </div>
              <label>
                <span>Ваше имя</span>
                <input name="name" placeholder="Как к вам обращаться?" required />
              </label>
              <label>
                <span>Телефон</span>
                <input name="phone" type="tel" placeholder="+7 999 000-00-00" required />
              </label>
              <label>
                <span>Что хотите заказать?</span>
                <select name="type" defaultValue="">
                  <option value="" disabled>Выберите тип мебели</option>
                  <option>Кухня</option>
                  <option>Шкаф</option>
                  <option>Гардеробная</option>
                  <option>Прихожая</option>
                  <option>Детская</option>
                  <option>Другое</option>
                </select>
              </label>
              <label className="file-label">
                <span>Фото или размеры</span>
                <input name="file" type="file" accept="image/*,.pdf" />
                <span className="file-control"><b>＋</b> Прикрепить файл</span>
              </label>
              <button className="submit-button" type="submit">Получить расчёт <span>↗</span></button>
              <p className="form-note">Нажимая кнопку, вы соглашаетесь на обработку персональных данных.</p>
            </form>
          )}
        </div>
      </section>

      <footer id="contacts">
        <div className="footer-top">
          <div>
            <div className="eyebrow light"><span /> Контакты</div>
            <h2>Давайте обсудим<br /><em>ваш проект</em></h2>
          </div>
          <a className="round-link" href="https://vk.me/ms_korpus" target="_blank" rel="noreferrer">
            Написать<br />в VK <span>↗</span>
          </a>
        </div>
        <div className="footer-grid">
          <div>
            <span className="footer-label">Студия</span>
            <p>Киров, ул. Воровского, 87</p>
            <small>Пн–Пт 10:00–19:00<br />Сб 10:00–16:00</small>
          </div>
          <div>
            <span className="footer-label">Производство</span>
            <p>Киров, ул. Потребкооперации, 17</p>
            <a href="tel:+78332780348">+7 (8332) 78-03-48</a>
          </div>
          <div>
            <span className="footer-label">Связаться</span>
            <a href="tel:+79536770348">+7 (953) 677-03-48</a>
            <a href="tel:+79586670393">+7 (958) 667-03-93</a>
            <a href="mailto:korpusm2010@mail.ru">korpusm2010@mail.ru</a>
          </div>
          <div>
            <span className="footer-label">Социальные сети</span>
            <a href="https://vk.ru/ms_korpus" target="_blank" rel="noreferrer">ВКонтакте ↗</a>
            <a href="https://мебелькиров43.рф/" target="_blank" rel="noreferrer">Текущий сайт ↗</a>
          </div>
        </div>
        <div className="footer-bottom">
          <a className="brand footer-brand" href="#top"><span className="brand-mark">K</span><span>KORPUS</span></a>
          <span>Мебельная студия · Киров</span>
          <span>© 2026 · Демонстрационный концепт</span>
        </div>
      </footer>

      {activeImage && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр проекта" onClick={() => setActiveImage(null)}>
          <button type="button" aria-label="Закрыть" onClick={() => setActiveImage(null)}>×</button>
          <div className="lightbox-image" onClick={(event) => event.stopPropagation()}>
            <Image src={activeImage} alt="Увеличенная фотография проекта Korpus" fill sizes="90vw" />
          </div>
        </div>
      )}
    </main>
  );
}
