/**
 * 바이브 카페 (Vibe Cafe) 주문서 및 주문 내역 스크립트
 * 1) Supabase 데이터베이스(cafe_menu03) 연동
 * 2) 실시간 예상 금액 계산
 * 3) 입력값 유효성 검사 및 Supabase 주문 저장
 * 4) 탭 전환 (주문하기 / 주문 내역)
 * 5) 주문 내역 목록 렌더링, 취소 및 전체 삭제 기능
 */

// ==========================================
// [Supabase 설정]
// 아래 상수에 본인의 Supabase 프로젝트 URL과 anon 키를 직접 입력해주세요.
// ==========================================
const SUPABASE_URL = 'https://iwxxzrvpvqtjlhvgwihh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eHh6cnZwdnF0amxodmd3aWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzY5MjEsImV4cCI6MjEwNjgxMjkyMX0.Mx06ETi3HNjBG6e_MaUVIgygGOzHNOTo5gChrbCqV8Q'

// Supabase 클라이언트 초기화 (요청하신 변수명: supabaseClient)
// URL과 Key가 올바른 형태일 때만 안전하게 클라이언트를 생성하여,
// URL 미입력 시에도 금액 계산과 주문서 UI가 멈추지 않도록 방어 코드를 적용합니다.
let supabaseClient = null;
try {
    if (typeof supabase !== 'undefined' && 
        SUPABASE_URL && 
        SUPABASE_URL.startsWith('http') && 
        SUPABASE_KEY && 
        SUPABASE_KEY !== 'YOUR_SUPABASE_KEY') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn('⚠️ Supabase URL과 Key가 아직 기본값입니다. script.js 상단에 실제 Supabase 프로젝트 정보를 입력해주세요.');
    }
} catch (error) {
    console.error('Supabase 클라이언트 초기화 오류:', error);
}

// HTML 문서가 완전히 준비되면 스크립트를 실행합니다.
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. 사용할 HTML 요소(DOM) 가져오기
    // ==========================================
    // [탭 관련 요소]
    const tabBtnOrder = document.getElementById('tab-btn-order');         // '☕ 주문하기' 탭 버튼
    const tabBtnHistory = document.getElementById('tab-btn-history');     // '📋 주문 내역' 탭 버튼
    const tabOrder = document.getElementById('tab-order');                 // 주문하기 탭 컨텐츠 영역
    const tabHistory = document.getElementById('tab-history');             // 주문 내역 탭 컨텐츠 영역
    const orderCountBadge = document.getElementById('order-count-badge'); // 주문 내역 건수 둥근 배지

    // [주문서 폼 관련 요소]
    const orderForm = document.getElementById('order-form');                     // 주문서 폼 전체
    const customerNameInput = document.getElementById('customer-name');         // 이름 입력창
    const customerPhoneInput = document.getElementById('customer-phone');       // 전화번호 입력창
    const beverageSelect = document.getElementById('beverage');                 // 음료 선택 드롭다운
    const sizeRadios = document.querySelectorAll('input[name="size"]');         // 사이즈 라디오 버튼 목록
    const optionCheckboxes = document.querySelectorAll('input[name="option"]'); // 추가 옵션 체크박스 목록
    const quantityInput = document.getElementById('quantity');                  // 수량 입력창
    const requestsTextarea = document.getElementById('requests');               // 요청사항 입력창
    const totalPriceSpan = document.getElementById('total-price');              // 예상 금액 표시 span
    const submitBtn = document.getElementById('submit-btn');                    // 주문하기 버튼
    const orderConfirmation = document.getElementById('order-confirmation');    // 주문 확인 메시지 영역

    // [주문 내역 관련 요소]
    const orderList = document.getElementById('order-list');                     // 주문 카드들이 들어갈 컨테이너
    const emptyHistory = document.getElementById('empty-history');               // 빈 내역 안내 메시지
    const historySummary = document.getElementById('history-summary');           // 총 금액 요약 영역
    const totalHistoryAmount = document.getElementById('total-history-amount');   // 총 주문 금액 표시 텍스트
    const clearAllOrdersBtn = document.getElementById('clear-all-orders-btn');   // 내역 모두 지우기 버튼

    // ==========================================
    // 2. 데이터 저장소 및 설정 변수
    // ==========================================
    let orders = [];          // 접수된 주문 객체들을 보관하는 로컬 배열
    let orderIdCounter = 1;   // 로컬 주문 번호 부여용 카운터

    // 옵션 영문 코드(value)를 한글 이름으로 변환하기 위한 객체
    const optionNamesMap = {
        shot: '샷 추가',
        cream: '크림 추가',
        syrup: '시럽 추가',
        decaf: '디카페인'
    };

    // ==========================================
    // 3. 금액 계산 함수 (calculateTotal)
    // ==========================================
    /**
     * 선택된 음료, 사이즈, 추가 옵션, 수량을 바탕으로 총 금액을 계산하고
     * 화면의 예상 금액 영역을 업데이트하는 함수
     * @returns {number} 계산된 총 금액
     */
    function calculateTotal() {
        // [조건] 음료를 아직 고르지 않았으면 0원으로 표시
        if (!beverageSelect.value) {
            totalPriceSpan.textContent = '0';
            return 0;
        }

        // 1) 선택된 음료의 기본 가격 가져오기 (data-price 속성 읽기)
        const selectedBeverageOption = beverageSelect.options[beverageSelect.selectedIndex];
        const beveragePrice = Number(selectedBeverageOption.dataset.price) || 0;

        // 2) 선택된 사이즈 추가 금액 가져오기
        const checkedSizeRadio = document.querySelector('input[name="size"]:checked');
        const sizePrice = checkedSizeRadio ? (Number(checkedSizeRadio.dataset.price) || 0) : 0;

        // 3) 선택된 추가 옵션들의 금액 모두 더하기
        let optionsPrice = 0;
        const checkedOptions = document.querySelectorAll('input[name="option"]:checked');
        checkedOptions.forEach(option => {
            optionsPrice += Number(option.dataset.price) || 0;
        });

        // 4) 수량 가져오기 (1 미만이거나 숫자가 아니면 기본 1로 처리)
        let quantity = parseInt(quantityInput.value, 10);
        if (isNaN(quantity) || quantity < 1) {
            quantity = 1;
        }

        // 5) 총 금액 = (음료 가격 + 사이즈 금액 + 옵션 금액) * 수량
        const total = (beveragePrice + sizePrice + optionsPrice) * quantity;

        // 6) 화면에 천 단위 콤마(toLocaleString)를 적용하여 표시
        totalPriceSpan.textContent = total.toLocaleString();

        return total;
    }

    // ==========================================
    // 4. 실시간 금액 계산 이벤트 연결
    // ==========================================
    // 음료 드롭다운을 변경했을 때
    beverageSelect.addEventListener('change', calculateTotal);

    // 사이즈 라디오 버튼을 변경했을 때
    sizeRadios.forEach(radio => {
        radio.addEventListener('change', calculateTotal);
    });

    // 추가 옵션 체크박스를 클릭했을 때
    optionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', calculateTotal);
    });

    // 수량을 변경하거나 직접 입력할 때
    quantityInput.addEventListener('input', calculateTotal);
    quantityInput.addEventListener('change', calculateTotal);

    // ==========================================
    // 5. 탭 전환 기능
    // ==========================================
    /**
     * 활성화할 탭을 전환하는 함수
     * @param {'order' | 'history'} targetTab - 전환할 탭 대상
     */
    function switchTab(targetTab) {
        if (targetTab === 'order') {
            // 주문하기 탭 활성화
            tabBtnOrder.classList.add('active');
            tabBtnHistory.classList.remove('active');
            tabOrder.classList.remove('hidden');
            tabHistory.classList.add('hidden');
        } else {
            // 주문 내역 탭 활성화
            tabBtnHistory.classList.add('active');
            tabBtnOrder.classList.remove('active');
            tabHistory.classList.remove('hidden');
            tabOrder.classList.add('hidden');
        }
    }

    tabBtnOrder.addEventListener('click', () => switchTab('order'));
    tabBtnHistory.addEventListener('click', () => switchTab('history'));

    // ==========================================
    // 6. 주문 내역 화면 그리기 (renderOrders)
    // ==========================================
    /**
     * orders 배열의 데이터를 바탕으로 주문 내역 탭 화면을 렌더링하는 함수
     * (보안을 위해 사용자가 입력한 문자열은 innerHTML 대신 textContent로 삽입)
     */
    function renderOrders() {
        // 1) 탭 옆의 둥근 갈색 배지에 현재 주문 건수 표시
        orderCountBadge.textContent = orders.length;

        // 2) 이전 목록 내용 비우기
        orderList.innerHTML = '';

        // 3) 주문 내역이 하나도 없는 경우
        if (orders.length === 0) {
            emptyHistory.classList.remove('hidden');   // "아직 주문 내역이 없어요 ☕" 표시
            historySummary.classList.add('hidden');    // 하단 총 금액 요약 숨김
            return;
        }

        // 4) 주문 내역이 있는 경우
        emptyHistory.classList.add('hidden');          // 빈 내역 안내 숨김
        historySummary.classList.remove('hidden');     // 하단 총 금액 요약 표시

        let totalSum = 0; // 전체 주문 금액 합산 변수

        // 5) 최신 주문 순으로 카드 생성 (orders 배열 순서대로 순회)
        orders.forEach((order) => {
            totalSum += order.totalPrice;

            // [주문 카드 컨테이너 생성] 베이지 카드 + 왼쪽 갈색 세로줄
            const card = document.createElement('div');
            card.className = 'order-card';

            // [오른쪽 위 취소 버튼 생성]
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'cancel-order-btn';
            cancelBtn.textContent = '취소';
            cancelBtn.addEventListener('click', () => {
                // confirm 창으로 한 번 더 확인 후 삭제
                const isConfirmed = confirm(`주문번호 #${order.orderId} (${order.name}님) 주문을 취소하시겠습니까?`);
                if (isConfirmed) {
                    // 해당 주문번호를 가진 주문을 배열에서 제외
                    orders = orders.filter(item => item.orderId !== order.orderId);
                    // 목록 다시 그리기
                    renderOrders();
                }
            });
            card.appendChild(cancelBtn);

            // [1줄: "#1 홍길동님 · 5,000원"]
            const line1 = document.createElement('div');
            line1.className = 'order-line-1';
            // 사용자 이름은 보안을 위해 반드시 textContent로 삽입
            line1.textContent = `#${order.orderId} ${order.name}님 · ${order.totalPrice.toLocaleString()}원`;
            card.appendChild(line1);

            // [2줄: "카페라떼 M사이즈 (샷 추가) 1잔"]
            const line2 = document.createElement('div');
            line2.className = 'order-line-2';
            const optionString = order.options && order.options.length > 0 ? ` (${order.options.join(', ')})` : '';
            line2.textContent = `${order.beverage} ${order.size}사이즈${optionString} ${order.quantity}잔`;
            card.appendChild(line2);

            // [3줄: 요청사항(있을 때만) · 주문 시간]
            const line3 = document.createElement('div');
            line3.className = 'order-line-3';
            if (order.requests && order.requests.trim() !== '') {
                // 사용자가 입력한 요청사항을 안전하게 textContent로 결합
                line3.textContent = `${order.requests.trim()} · ${order.orderTime}`;
            } else {
                line3.textContent = order.orderTime;
            }
            card.appendChild(line3);

            // 완성된 카드를 주문 목록에 추가
            orderList.appendChild(card);
        });

        // 6) 목록 아래 "총 주문 금액: 15,000원 (3건)" 텍스트 업데이트
        totalHistoryAmount.textContent = `총 주문 금액: ${totalSum.toLocaleString()}원 (${orders.length}건)`;
    }

    // ==========================================
    // 7. 내역 모두 지우기 버튼 이벤트
    // ==========================================
    clearAllOrdersBtn.addEventListener('click', () => {
        if (confirm('주문 내역을 모두 지우시겠습니까?')) {
            orders = []; // 모든 주문 데이터 비우기
            renderOrders(); // 화면 갱신
        }
    });

    // ==========================================
    // 8. 주문하기 버튼 클릭 (폼 제출 & Supabase 저장)
    // ==========================================
    orderForm.addEventListener('submit', async (event) => {
        // 브라우저의 기본 새로고침 동작 방지
        event.preventDefault();

        // (1) 이름 입력 검사: 비어있으면 알림 후 포커스
        const customerName = customerNameInput.value.trim();
        if (!customerName) {
            alert('이름을 입력해주세요');
            customerNameInput.focus();
            return;
        }

        // (2) 음료 선택 검사: 미선택이면 알림 후 포커스
        if (!beverageSelect.value) {
            alert('음료를 선택해주세요');
            beverageSelect.focus();
            return;
        }

        // (3) 음료 명칭 및 음료 기본 가격 추출
        const selectedBeverageOption = beverageSelect.options[beverageSelect.selectedIndex];
        const beverageName = selectedBeverageOption.text.split(' ')[0]; // 예: "카페라떼"
        const beveragePrice = Number(selectedBeverageOption.dataset.price) || 0; // 음료 단가

        // (4) 사이즈 명칭 추출 (예: "M")
        const checkedSizeRadio = document.querySelector('input[name="size"]:checked');
        const sizeCode = checkedSizeRadio ? checkedSizeRadio.value : 'M';

        // (5) 선택된 추가 옵션 목록 만들기 (옵션이 없으면 빈 배열)
        const checkedOptions = document.querySelectorAll('input[name="option"]:checked');
        const selectedOptionNames = [];
        checkedOptions.forEach(option => {
            const name = optionNamesMap[option.value] || option.value;
            selectedOptionNames.push(name);
        });

        // 주문 확인 메시지용 옵션 문자열: 옵션이 있으면 " (샷 추가)" 형태
        let optionText = '';
        if (selectedOptionNames.length > 0) {
            optionText = ` (${selectedOptionNames.join(', ')})`;
        }

        // (6) 수량 및 총 결제 금액 계산
        const quantity = parseInt(quantityInput.value, 10) || 1;
        const total = calculateTotal();

        // (7) 전화번호 및 요청사항 가져오기
        const customerPhone = customerPhoneInput.value.trim();
        const requests = requestsTextarea.value.trim();

        // (8) 현재 주문 시간 생성 (예: "오후 12:45")
        const currentTime = new Date().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // ==========================================
        // [Supabase 저장 데이터 구성]
        // 요청된 열 이름과 일치하도록 매핑:
        // customer_name, phone, drink, drink_price, size, options(배열), quantity, request, total_price
        // ==========================================
        const orderData = {
            customer_name: customerName,
            phone: customerPhone,
            drink: beverageName,
            drink_price: beveragePrice,
            size: sizeCode,
            options: selectedOptionNames, // 배열 형태
            quantity: quantity,
            request: requests,
            total_price: total
        };

        // 저장 진행 중 주문하기 버튼 비활성화 (중복 클릭 방지)
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = '주문 저장 중...';

        try {
            let savedId = orderIdCounter++;

            // Supabase 클라이언트가 정상 설정된 경우 DB에 저장 시도
            if (supabaseClient) {
                // Supabase의 cafe_menu03 테이블에 주문 데이터 INSERT
                const { data, error } = await supabaseClient
                    .from('cafe_menu03')
                    .insert([orderData])
                    .select();

                // 에러 발생 시 catch 블록으로 이동
                if (error) {
                    throw error;
                }

                // DB에서 발급된 id가 있으면 주문번호로 사용
                if (data && data[0] && data[0].id) {
                    savedId = data[0].id;
                }
            } else {
                console.warn('⚠️ Supabase URL/Key가 아직 설정되지 않아 로컬 내역에만 저장됩니다. DB 저장을 원하시면 script.js 상단에 실제 Supabase 정보를 입력해주세요.');
            }

            // [성공 1] 로컬 orders 배열에 추가하여 주문 내역 탭에서도 즉시 확인 가능하게 함
            const newOrder = {
                orderId: savedId,
                name: customerName,
                beverage: beverageName,
                size: sizeCode,
                options: selectedOptionNames,
                quantity: quantity,
                requests: requests,
                totalPrice: total,
                orderTime: currentTime
            };
            orders.unshift(newOrder);
            renderOrders();

            // [성공 2] 기존 주문 확인 메시지 화면 표시
            const confirmationMessage = `${customerName}님, ${beverageName} ${sizeCode}사이즈${optionText} ${quantity}잔, 총 ${total.toLocaleString()}원 주문이 접수되었습니다!`;
            orderConfirmation.textContent = confirmationMessage;
            orderConfirmation.classList.remove('hidden');

            // 주문 확인 메시지 위치로 부드럽게 스크롤 이동
            orderConfirmation.scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            // [실패] 에러 알림창 및 콘솔 출력
            alert('주문 저장에 실패했어요');
            console.error('주문 저장 에러:', err);
        } finally {
            // 저장이 끝나면(성공/실패 모두) 주문하기 버튼 다시 활성화
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });

    // ==========================================
    // 9. 다시 작성 버튼 클릭 (리셋 처리)
    // ==========================================
    orderForm.addEventListener('reset', () => {
        // 주문서는 초기화하되, orders 주문 내역은 절대 지우지 않습니다.
        setTimeout(() => {
            // 예상 금액 0원으로 재계산 및 표시
            calculateTotal();

            // 주문 확인 메시지 숨기기 및 비우기
            orderConfirmation.textContent = '';
            orderConfirmation.classList.add('hidden');
        }, 0);
    });

    // ==========================================
    // 10. 초기 실행
    // ==========================================
    calculateTotal(); // 첫 로딩 시 예상 금액 0원 설정
    renderOrders();   // 첫 로딩 시 주문 내역(빈 목록 상태) 초기 렌더링
});
