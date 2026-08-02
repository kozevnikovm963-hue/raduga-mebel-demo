"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  type ApplicationErrors,
  type ApplicationInput,
  validateApplicationInput,
  validatePhotoList,
} from "@/lib/forms/validation";
import {
  ApplicationSubmissionError,
  sendApplication,
  SUBMISSION_ERROR_MESSAGE,
} from "@/lib/forms/submit-application";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const asset = (path: string) => `${basePath}${path}`;

const projects = [
  { src: asset("/images/kitchen-07.jpg"), title: "Графичная кухня", tone: "Антрацит · белый", size: "hero-wide", position: "center" },
  { src: asset("/images/portfolio-wardrobe-01.webp"), title: "Шкаф-купе", tone: "В интерьере", size: "hero-tall", position: "center" },
  { src: asset("/images/kitchen-01.jpg"), title: "Лаконичная кухня", tone: "Белый · орех", size: "gallery-wide", position: "center 48%" },
  { src: asset("/images/portfolio-wardrobe-open.webp"), title: "Система хранения", tone: "Внутреннее наполнение", size: "gallery-side", position: "center 44%" },
  { src: asset("/images/portfolio-kitchen-01.webp"), title: "Кухня с барной стойкой", tone: "Реализованный проект", size: "gallery-large", position: "center 52%" },
  { src: asset("/images/portfolio-wardrobe-02.webp"), title: "Встроенный шкаф", tone: "Реализованный проект", size: "gallery-medium", position: "center 42%" },
  { src: asset("/images/portfolio-kitchen-02.webp"), title: "Светлая кухня", tone: "Общий план", size: "gallery-detail", position: "center 54%" },
  { src: asset("/images/portfolio-wardrobe-clean.webp"), title: "Шкаф в прихожей", tone: "Реализованный проект", size: "gallery-portrait", position: "center 44%" },
  { src: asset("/images/portfolio-kitchen-03.webp"), title: "Кухня с островом", tone: "Реализованный проект", size: "gallery-wide", position: "center 52%" },
  { src: asset("/images/portfolio-kitchen-04.webp"), title: "Угловая кухня", tone: "Общий план", size: "gallery-side", position: "center 52%" },
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
  ["05", "Монтаж", "Собираем и устанавливаем мебель на объекте."],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<ApplicationErrors>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const submitInFlight = useRef(false);

  useEffect(() => {
    document.body.style.overflow = activeImage ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeImage]);

  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopMotion = window.matchMedia("(min-width: 901px)");
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".reveal-section"));
    const parallaxItems = Array.from(document.querySelectorAll<HTMLElement>(".parallax-photo"));
    let frame = 0;

    root.classList.add("motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -7% 0px" },
    );

    if (reducedMotion.matches) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
    } else {
      revealItems.forEach((item) => observer.observe(item));
    }

    const updateParallax = () => {
      frame = 0;

      if (reducedMotion.matches || !desktopMotion.matches) {
        parallaxItems.forEach((item) => item.style.setProperty("--parallax-y", "0px"));
        return;
      }

      parallaxItems.forEach((item) => {
        const rect = item.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

        const center = rect.top + rect.height / 2;
        const progress = (center - window.innerHeight / 2) / (window.innerHeight + rect.height);
        const offset = Math.max(-12, Math.min(12, progress * -22));
        item.style.setProperty("--parallax-y", `${offset.toFixed(2)}px`);
      });
    };

    const requestParallaxUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateParallax);
    };

    updateParallax();
    window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
    window.addEventListener("resize", requestParallaxUpdate);
    reducedMotion.addEventListener("change", requestParallaxUpdate);
    desktopMotion.addEventListener("change", requestParallaxUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestParallaxUpdate);
      window.removeEventListener("resize", requestParallaxUpdate);
      reducedMotion.removeEventListener("change", requestParallaxUpdate);
      desktopMotion.removeEventListener("change", requestParallaxUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      root.classList.remove("motion-ready");
    };
  }, []);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const raw: ApplicationInput = {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      furnitureType: String(formData.get("furnitureType") ?? ""),
      comment: String(formData.get("comment") ?? ""),
      website: String(formData.get("website") ?? ""),
    };
    const validation = validateApplicationInput(raw);
    const submittedFiles = formData
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const photoError = validatePhotoList(submittedFiles);
    const consentGiven = formData.get("consent") === "accepted";
    const errors: ApplicationErrors = {
      ...validation.errors,
      ...(photoError ? { photos: photoError } : {}),
      ...(!consentGiven ? { consent: "Подтвердите согласие с политикой обработки персональных данных." } : {}),
    };

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const message = await sendApplication(formData);
      setSuccessMessage(message);
      form.reset();
      setSelectedFiles([]);
      setFormErrors({});
      setSent(true);
    } catch (error) {
      setFormErrors({
        ...(error instanceof ApplicationSubmissionError ? error.fieldErrors : {}),
        form: SUBMISSION_ERROR_MESSAGE,
      });
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  function handleFiles(input: HTMLInputElement) {
    const nextFiles = input.files ? Array.from(input.files) : [];
    const error = validatePhotoList(nextFiles);
    if (error) input.value = "";
    setSelectedFiles(error ? [] : nextFiles);
    setFormErrors((current) => ({ ...current, photos: error ?? undefined }));
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Korpus — наверх">
          <Image
            className="brand-logo"
            src={asset("/korpus-final.svg")}
            alt="KORPUS — мебельная студия"
            width={826}
            height={326}
            priority
          />
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
        <div className="hero-photo parallax-photo">
          <Image
            src={asset("/images/hero-main.jpg")}
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
            <a className="button button-light" href="#calc">Рассчитать стоимость <span>↗︎</span></a>
            <a className="text-link light-link" href="#works">Смотреть проекты <span>↓</span></a>
          </div>
        </div>
        <div className="hero-counter">
          <strong>с 2006</strong>
          <span>создаём мебель<br />по вашим размерам</span>
        </div>
      </section>

      <section className="intro section-pad reveal-section">
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
          <div><strong>Киров</strong><span>собственное производство</span></div>
          <div><strong>5</strong><span>этапов до результата</span></div>
        </div>
      </section>

      <section className="works section-pad reveal-section" id="works">
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
                sizes="(max-width: 700px) 100vw, (max-width: 1050px) 70vw, 65vw"
                style={{ objectPosition: project.position ?? "center" }}
              />
              <span className="project-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="project-caption">
                <strong>{project.title}</strong>
                <small>{project.tone}</small>
              </span>
              <span className="project-open">↗︎</span>
            </button>
          ))}
        </div>
        <a className="button button-dark centered" href="https://vk.ru/ms_korpus" target="_blank" rel="noreferrer">
          Больше работ в VK <span>↗︎</span>
        </a>
      </section>

      <section className="categories section-pad reveal-section" id="categories">
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
              <span className="category-arrow">↗︎</span>
            </a>
          ))}
        </div>
      </section>

      <section className="feature reveal-section">
        <div className="feature-photo parallax-photo">
          <Image src={asset("/images/kitchen-taupe-feature.jpg")} alt="Кухня KORPUS в тёплом сером оттенке" fill sizes="60vw" />
        </div>
        <div className="feature-copy">
          <div className="eyebrow"><span /> Подход</div>
          <h2>Не просто мебель.<br /><em>Точное решение.</em></h2>
          <p>Подбираем материалы и комплектацию под задачу и бюджет. Работаем с фурнитурой BLUM, HETTICH, BOYARD, FIRMAX, GRATTIS и других производителей.</p>
          <ul>
            <li><span>01</span> Собственное производство</li>
            <li><span>02</span> Проекты любой сложности</li>
            <li><span>03</span> Заключение договора</li>
            <li><span>04</span> Подбор материалов и комплектации</li>
          </ul>
        </div>
      </section>

      <section className="process section-pad reveal-section" id="process">
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

      <section className="review-section section-pad reveal-section">
        <div className="review-heading">Отзывы клиентов</div>
        <div className="review-quote">“</div>
        <div className="review-body">
          <span className="review-line" aria-hidden="true" />
          <blockquote>
            Второй раз заказываю мебель здесь. Кухню установили раньше, чем ожидалось — всё отлично. Спасибо за добросовестную работу и индивидуальный подход в подборе материалов.
          </blockquote>
          <span className="review-line" aria-hidden="true" />
        </div>
        <div className="review-author">
          <span>Евгения Ф.</span>
          <span>Отзыв клиента · VK</span>
        </div>
        <a className="review-link" href="https://vk.ru/topic-169502771_39371654" target="_blank" rel="noreferrer">
          Смотреть все отзывы <span>→</span>
        </a>
      </section>

      <section className="calc reveal-section" id="calc">
        <div className="calc-visual parallax-photo">
          <Image src={asset("/images/kitchen-marble-form.jpg")} alt="Проект кухни KORPUS" fill sizes="50vw" />
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
              <p>{successMessage}</p>
              <button type="button" onClick={() => setSent(false)}>Заполнить ещё раз</button>
            </div>
          ) : (
            <form onSubmit={submitForm} noValidate>
              <div className="form-heading">
                <span>Заявка на расчёт</span>
                <small>Ответим и уточним детали</small>
              </div>
              <label>
                <span>Ваше имя</span>
                <input
                  name="name"
                  placeholder="Как к вам обращаться?"
                  autoComplete="name"
                  aria-invalid={Boolean(formErrors.name)}
                  aria-describedby={formErrors.name ? "name-error" : undefined}
                  required
                />
                {formErrors.name && <small className="field-error" id="name-error">{formErrors.name}</small>}
              </label>
              <label>
                <span>Телефон</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+7 999 000-00-00"
                  autoComplete="tel"
                  aria-invalid={Boolean(formErrors.phone)}
                  aria-describedby={formErrors.phone ? "phone-error" : undefined}
                  required
                />
                {formErrors.phone && <small className="field-error" id="phone-error">{formErrors.phone}</small>}
              </label>
              <label>
                <span>Что хотите заказать?</span>
                <select
                  name="furnitureType"
                  defaultValue=""
                  aria-invalid={Boolean(formErrors.furnitureType)}
                  aria-describedby={formErrors.furnitureType ? "furniture-error" : undefined}
                >
                  <option value="">Выберите тип мебели</option>
                  <option>Кухня</option>
                  <option>Шкаф</option>
                  <option>Гардеробная</option>
                  <option>Прихожая</option>
                  <option>Детская</option>
                  <option>Другое</option>
                </select>
                {formErrors.furnitureType && <small className="field-error" id="furniture-error">{formErrors.furnitureType}</small>}
              </label>
              <label>
                <span>Комментарий или примерные размеры</span>
                <textarea
                  name="comment"
                  placeholder="Например: кухня 3,2 × 2,4 м"
                  maxLength={1000}
                  rows={3}
                  aria-invalid={Boolean(formErrors.comment)}
                  aria-describedby={formErrors.comment ? "comment-error" : "comment-hint"}
                />
                <small className="field-hint" id="comment-hint">До 1000 символов</small>
                {formErrors.comment && <small className="field-error" id="comment-error">{formErrors.comment}</small>}
              </label>
              <label className="file-label">
                <span>Фотографии</span>
                <input
                  name="photos"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => handleFiles(event.currentTarget)}
                  aria-invalid={Boolean(formErrors.photos)}
                  aria-describedby="photos-hint"
                />
                <span className="file-control"><b>＋</b> Прикрепить фотографии</span>
                <small className="field-hint" id="photos-hint">До 5 файлов JPG, PNG или WEBP · до 10 МБ каждый</small>
                {selectedFiles.length > 0 && (
                  <span className="selected-files">{selectedFiles.map((file) => file.name).join(" · ")}</span>
                )}
                {formErrors.photos && <small className="field-error">{formErrors.photos}</small>}
              </label>
              <div className="honeypot-field" aria-hidden="true">
                <label htmlFor="website">Ваш сайт</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>
              {formErrors.form && <p className="form-error" role="alert">{formErrors.form}</p>}
              <label className="consent-label">
                <input
                  name="consent"
                  type="checkbox"
                  value="accepted"
                  aria-invalid={Boolean(formErrors.consent)}
                  aria-describedby={formErrors.consent ? "consent-error" : undefined}
                  required
                />
                <span>
                  Я согласен с{" "}
                  <a href={asset("/privacy/")}>политикой обработки персональных данных</a>
                </span>
              </label>
              {formErrors.consent && (
                <small className="field-error consent-error" id="consent-error">{formErrors.consent}</small>
              )}
              <button className="submit-button" type="submit" disabled={submitting}>
                {submitting ? "Отправляем…" : "Получить расчёт"} <span>↗︎</span>
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="reveal-section" id="contacts">
        <div className="footer-top">
          <div>
            <div className="eyebrow light"><span /> Контакты</div>
            <h2>Давайте обсудим<br /><em>ваш проект</em></h2>
          </div>
          <a className="round-link" href="https://vk.me/ms_korpus" target="_blank" rel="noreferrer">
            Написать<br />в VK <span>↗︎</span>
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
            <a href="https://vk.ru/ms_korpus" target="_blank" rel="noreferrer">ВКонтакте ↗︎</a>
          </div>
        </div>
        <div className="footer-bottom">
          <a className="brand footer-brand" href="#top" aria-label="KORPUS — наверх">
            <Image
              className="brand-logo"
              src={asset("/korpus-final.svg")}
              alt="KORPUS — мебельная студия"
              width={826}
              height={326}
            />
          </a>
          <span>Мебельная студия · Киров</span>
          <span><a href={asset("/privacy/")}>Политика обработки данных</a><br />© 2026 · KORPUS</span>
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
